param(
    [string]$Database = "pulse-health-dashboard-db",
    [string]$WorkerName = "pulse-health-dashboard",
    [string]$OutputDirectory = "backups"
)

$ErrorActionPreference = "Stop"
$env:WRANGLER_WRITE_LOGS = "false"
$env:WRANGLER_LOG_PATH = ".wrangler\logs"

$projectRoot = Split-Path -Parent $PSScriptRoot
$backupRoot = Join-Path $projectRoot $OutputDirectory
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupDirectory = Join-Path $backupRoot (Join-Path (Get-Date -Format "yyyy-MM-dd") $timestamp)
$outputFile = Join-Path $backupDirectory "database.sql"
$metadataFile = Join-Path $backupDirectory "metadata.json"

function Invoke-WranglerJson {
    param([string[]]$WranglerArguments)

    $output = & npx wrangler @WranglerArguments
    if ($LASTEXITCODE -ne 0) {
        throw "Wrangler command failed: wrangler $($WranglerArguments -join ' ')"
    }

    $json = ($output | Out-String).Trim()
    if (-not $json) {
        throw "Wrangler returned no JSON output."
    }
    return $json | ConvertFrom-Json
}

function Invoke-D1Query {
    param([string]$Sql)

    $response = @(Invoke-WranglerJson @("d1", "execute", $Database, "--remote", "--command=$Sql", "--json"))
    if ($response.Count -eq 0 -or -not $response[0].success) {
        throw "D1 metadata query failed."
    }
    return @($response[0].results)
}

function Get-FileSha256 {
    param([string]$Path)

    $sha256 = [System.Security.Cryptography.SHA256]::Create()
    $stream = [System.IO.File]::OpenRead($Path)
    try {
        $hashBytes = $sha256.ComputeHash($stream)
        return ([System.BitConverter]::ToString($hashBytes)).Replace("-", "")
    }
    finally {
        $stream.Dispose()
        $sha256.Dispose()
    }
}

New-Item -ItemType Directory -Path $backupDirectory -Force | Out-Null

$databaseList = @((Invoke-WranglerJson @("d1", "list", "--json")) | ForEach-Object { $_ })
$databaseInfo = $databaseList | Where-Object { $_.name -eq $Database } | Select-Object -First 1
if (-not $databaseInfo) {
    throw "D1 database was not found: $Database"
}

Write-Host "Exporting Cloudflare D1 database: $Database"
& npx wrangler d1 export $Database --remote "--output=$outputFile"
if ($LASTEXITCODE -ne 0) {
    throw "D1 export failed. No usable backup was created."
}
if (-not (Test-Path -LiteralPath $outputFile) -or (Get-Item -LiteralPath $outputFile).Length -eq 0) {
    throw "D1 export completed, but the backup file is missing or empty."
}

$schemaRows = @(Invoke-D1Query "SELECT name, type, sql FROM sqlite_schema WHERE type IN ('table','index') AND name NOT LIKE 'sqlite_%' AND name <> '_cf_KV' ORDER BY type, name;")
$tableDefinitions = @($schemaRows | Where-Object { $_.type -eq "table" })
$indexDefinitions = @($schemaRows | Where-Object { $_.type -eq "index" })
$countExpressions = @()
foreach ($table in $tableDefinitions) {
    if ($table.name -notmatch '^[A-Za-z_][A-Za-z0-9_]*$') {
        throw "Unsafe table name returned by sqlite_schema: $($table.name)"
    }
    $countExpressions += "(SELECT COUNT(*) FROM $($table.name)) AS $($table.name)"
}
$countRow = $null
if ($countExpressions.Count -gt 0) {
    $countRows = @(Invoke-D1Query "SELECT $($countExpressions -join ', ');")
    $countRow = $countRows[0]
}
$tables = @()
foreach ($table in $tableDefinitions) {
    $tables += [ordered]@{
        name = $table.name
        rowCount = [int64]$countRow.PSObject.Properties[$table.name].Value
        createSql = $table.sql
    }
}

$workerVersions = @((Invoke-WranglerJson @("versions", "list", "--name", $WorkerName, "--json")) | ForEach-Object { $_ })
$latestWorkerVersion = $workerVersions | Sort-Object -Property number -Descending | Select-Object -First 1
$tableNames = @($tables | ForEach-Object { $_.name })

$salarySnapshot = $null
if ($tableNames -contains "salary_records") {
    $salaryRows = @(Invoke-D1Query "SELECT month, workdays, gross_salary, taxable_income, income_tax, net_salary FROM salary_records WHERE month = '2026-07' LIMIT 1;")
    if ($salaryRows.Count -gt 0) { $salarySnapshot = $salaryRows[0] }
}

$latestHealth = $null
if ($tableNames -contains "health_daily") {
    $healthRows = @(Invoke-D1Query "SELECT date, source, updated_at FROM health_daily ORDER BY date DESC LIMIT 1;")
    if ($healthRows.Count -gt 0) { $latestHealth = $healthRows[0] }
}

$workExperienceOrder = @()
if ($tableNames -contains "work_experiences") {
    $workExperienceOrder = @(Invoke-D1Query "SELECT id, start_date, end_date FROM work_experiences ORDER BY start_date ASC, id ASC;")
}

$backupItem = Get-Item -LiteralPath $outputFile
$hash = Get-FileSha256 $outputFile
$metadata = [ordered]@{
    formatVersion = 1
    createdAt = (Get-Date).ToUniversalTime().ToString("o")
    sourceDatabase = [ordered]@{
        name = $databaseInfo.name
        id = $databaseInfo.uuid
        createdAt = $databaseInfo.created_at
        fileSizeBytes = $databaseInfo.file_size
    }
    worker = [ordered]@{
        name = $WorkerName
        versionId = $latestWorkerVersion.id
        versionNumber = $latestWorkerVersion.number
    }
    backup = [ordered]@{
        sqlFile = $backupItem.Name
        sizeBytes = $backupItem.Length
        sha256 = $hash
    }
    tables = $tables
    indexes = @($indexDefinitions | ForEach-Object { [ordered]@{ name = $_.name; createSql = $_.sql } })
    keyChecks = [ordered]@{
        salary202607 = $salarySnapshot
        latestHealth = $latestHealth
        workExperienceOrder = $workExperienceOrder
    }
}

$metadata | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $metadataFile -Encoding UTF8

Write-Host "Backup complete: $backupDirectory"
Write-Host "SQL: $outputFile"
Write-Host "Metadata: $metadataFile"
Write-Host "SHA256: $hash"
