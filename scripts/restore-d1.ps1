param(
    [Parameter(Mandatory = $true)]
    [string]$BackupFile,

    [string]$Database = "pulse-health-dashboard-db",

    [switch]$ConfirmRestore
)

$ErrorActionPreference = "Stop"

if (-not $ConfirmRestore) {
    throw "Restore changes the remote database. Verify the file, then rerun with -ConfirmRestore."
}

$resolvedBackup = Resolve-Path -LiteralPath $BackupFile -ErrorAction Stop
if ([System.IO.Path]::GetExtension($resolvedBackup.Path) -ne ".sql") {
    throw "Only .sql files exported by Wrangler can be restored."
}

Write-Host "Creating a safety backup before restore."
& (Join-Path $PSScriptRoot "backup-d1.ps1") -Database $Database
if ($LASTEXITCODE -ne 0) {
    throw "Safety backup failed. Restore was stopped."
}

Write-Host "Restoring $Database from: $($resolvedBackup.Path)"
& npx wrangler d1 execute $Database --remote --file=$resolvedBackup.Path

if ($LASTEXITCODE -ne 0) {
    throw "D1 restore failed. Keep the safety backup and inspect Wrangler output."
}

Write-Host "Restore complete. Verify calendar, salary, experience, and health data now."
