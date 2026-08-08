param(
    [Parameter(Mandatory = $true)]
    [string]$BackupFile,

    [Parameter(Mandatory = $true)]
    [string]$Database,

    [string]$MetadataFile,

    [string]$ProductionDatabaseId = $env:PULSE_PRODUCTION_D1_ID,

    [switch]$ConfirmRestore,

    [switch]$AllowProductionRestore
)

$ErrorActionPreference = "Stop"
$env:WRANGLER_WRITE_LOGS = "false"
$env:WRANGLER_LOG_PATH = ".wrangler\logs"
$productionDatabase = "pulse-health-dashboard-db"
$productionDatabaseId = $ProductionDatabaseId

function Invoke-WranglerJson {
    param([string[]]$WranglerArguments)

    $output = & npx wrangler @WranglerArguments
    if ($LASTEXITCODE -ne 0) {
        throw "Wrangler command failed: wrangler $($WranglerArguments -join ' ')"
    }
    return (($output | Out-String).Trim() | ConvertFrom-Json)
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

if (-not $ConfirmRestore) {
    throw "Restore changes a remote database. Verify the target and rerun with -ConfirmRestore."
}

$resolvedBackup = Resolve-Path -LiteralPath $BackupFile -ErrorAction Stop
if ([System.IO.Path]::GetExtension($resolvedBackup.Path) -ne ".sql") {
    throw "Only .sql files exported by Wrangler can be restored."
}

if (-not $MetadataFile) {
    $MetadataFile = Join-Path (Split-Path -Parent $resolvedBackup.Path) "metadata.json"
}
$resolvedMetadata = Resolve-Path -LiteralPath $MetadataFile -ErrorAction Stop
$metadata = Get-Content -Raw -LiteralPath $resolvedMetadata.Path | ConvertFrom-Json

$actualHash = Get-FileSha256 $resolvedBackup.Path
$expectedHash = [string]$metadata.backup.sha256
if ($actualHash -ne $expectedHash.ToUpperInvariant()) {
    throw "Backup SHA256 does not match metadata. Restore was stopped."
}

$databaseList = @((Invoke-WranglerJson @("d1", "list", "--json")) | ForEach-Object { $_ })
$target = $databaseList | Where-Object { $_.name -eq $Database } | Select-Object -First 1
if (-not $target) {
    throw "Target D1 database was not found: $Database"
}

$isProduction = $target.uuid -eq $productionDatabaseId -or $target.name -eq $productionDatabase
if ($isProduction -and -not $AllowProductionRestore) {
    throw "Production restore is blocked by default. Use a separate recovery-drill database."
}
if ($AllowProductionRestore -and -not $isProduction) {
    throw "-AllowProductionRestore was supplied for a non-production database. Remove the switch."
}

if (-not $isProduction) {
    Write-Host "Creating a safety backup of the non-production target before restore."
    & (Join-Path $PSScriptRoot "backup-d1.ps1") -Database $Database -OutputDirectory "backups\pre-restore"
    if ($LASTEXITCODE -ne 0) {
        throw "Safety backup failed. Restore was stopped."
    }
}
else {
    Write-Host "Creating a safety backup of production before explicitly authorized restore."
    & (Join-Path $PSScriptRoot "backup-d1.ps1") -Database $Database -OutputDirectory "backups\pre-restore"
    if ($LASTEXITCODE -ne 0) {
        throw "Production safety backup failed. Restore was stopped."
    }
}

Write-Host "Restoring database '$($target.name)' ($($target.uuid)) from: $($resolvedBackup.Path)"
& npx wrangler d1 execute $Database --remote "--file=$($resolvedBackup.Path)"
if ($LASTEXITCODE -ne 0) {
    throw "D1 restore failed. Keep the safety backup and inspect Wrangler output."
}

& (Join-Path $PSScriptRoot "verify-d1-backup.ps1") -Database $Database -MetadataFile $resolvedMetadata.Path
if ($LASTEXITCODE -ne 0) {
    throw "Restore finished, but consistency verification failed."
}

Write-Host "Restore and consistency verification complete."
