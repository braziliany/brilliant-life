param(
    [Parameter(Mandatory = $true)]
    [string]$Database,

    [Parameter(Mandatory = $true)]
    [string]$MetadataFile
)

$ErrorActionPreference = "Stop"
$env:WRANGLER_WRITE_LOGS = "false"
$env:WRANGLER_LOG_PATH = ".wrangler\logs"

function Invoke-WranglerJson {
    param([string[]]$WranglerArguments)

    $output = & npx wrangler @WranglerArguments
    if ($LASTEXITCODE -ne 0) {
        throw "Wrangler command failed: wrangler $($WranglerArguments -join ' ')"
    }
    return (($output | Out-String).Trim() | ConvertFrom-Json)
}

function Invoke-D1Query {
    param([string]$Sql)

    $response = @(Invoke-WranglerJson @("d1", "execute", $Database, "--remote", "--command=$Sql", "--json"))
    if ($response.Count -eq 0 -or -not $response[0].success) {
        throw "D1 verification query failed."
    }
    return @($response[0].results)
}

function Assert-JsonEqual {
    param($Expected, $Actual, [string]$Label)

    $expectedJson = $Expected | ConvertTo-Json -Depth 10 -Compress
    $actualJson = $Actual | ConvertTo-Json -Depth 10 -Compress
    if ($expectedJson -ne $actualJson) {
        throw "$Label does not match the backup metadata."
    }
}

$resolvedMetadata = Resolve-Path -LiteralPath $MetadataFile -ErrorAction Stop
$metadata = Get-Content -Raw -LiteralPath $resolvedMetadata.Path | ConvertFrom-Json

$schemaRows = @(Invoke-D1Query "SELECT name, type, sql FROM sqlite_schema WHERE type IN ('table','index') AND name NOT LIKE 'sqlite_%' AND name <> '_cf_KV' ORDER BY type, name;")
$actualTableNames = @($schemaRows | Where-Object { $_.type -eq "table" } | ForEach-Object { $_.name })
$expectedTableNames = @($metadata.tables | ForEach-Object { $_.name })
Assert-JsonEqual $expectedTableNames $actualTableNames "Table list"

$actualIndexes = @($schemaRows | Where-Object { $_.type -eq "index" } | ForEach-Object { [ordered]@{ name = $_.name; createSql = $_.sql } })
Assert-JsonEqual @($metadata.indexes) $actualIndexes "Index list"

foreach ($table in @($metadata.tables)) {
    if ($table.name -notmatch '^[A-Za-z_][A-Za-z0-9_]*$') {
        throw "Unsafe table name in metadata: $($table.name)"
    }
    $countRows = @(Invoke-D1Query "SELECT COUNT(*) AS row_count FROM $($table.name);")
    if ([int64]$countRows[0].row_count -ne [int64]$table.rowCount) {
        throw "Row count mismatch for table: $($table.name)"
    }
}

if ($metadata.keyChecks.salary202607) {
    $actual = @(Invoke-D1Query "SELECT month, workdays, gross_salary, taxable_income, income_tax, net_salary FROM salary_records WHERE month = '2026-07' LIMIT 1;")
    Assert-JsonEqual $metadata.keyChecks.salary202607 $actual[0] "2026-07 salary snapshot"
}
if ($metadata.keyChecks.latestHealth) {
    $actual = @(Invoke-D1Query "SELECT date, source, updated_at FROM health_daily ORDER BY date DESC LIMIT 1;")
    Assert-JsonEqual $metadata.keyChecks.latestHealth $actual[0] "Latest health record"
}
if ($null -ne $metadata.keyChecks.workExperienceOrder) {
    $actual = @(Invoke-D1Query "SELECT id, start_date, end_date FROM work_experiences ORDER BY start_date ASC, id ASC;")
    Assert-JsonEqual @($metadata.keyChecks.workExperienceOrder) $actual "Work experience order"
}

Write-Host "D1 verification passed for '$Database': $($expectedTableNames.Count) tables and all recorded key checks match."
