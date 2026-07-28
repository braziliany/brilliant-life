param(
    [string]$Database = "pulse-health-dashboard-db",
    [string]$OutputDirectory = "backups"
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$backupRoot = Join-Path $projectRoot $OutputDirectory

New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$outputFile = Join-Path $backupRoot "$Database-$timestamp.sql"

Write-Host "Exporting Cloudflare D1 database: $Database"
& npx wrangler d1 export $Database --remote --output=$outputFile

if ($LASTEXITCODE -ne 0) {
    throw "D1 export failed. No usable backup was created."
}

if (-not (Test-Path -LiteralPath $outputFile) -or (Get-Item -LiteralPath $outputFile).Length -eq 0) {
    throw "D1 export completed, but the backup file is missing or empty."
}

$sha256 = [System.Security.Cryptography.SHA256]::Create()
$stream = [System.IO.File]::OpenRead($outputFile)
try {
    $hashBytes = $sha256.ComputeHash($stream)
    $hash = ([System.BitConverter]::ToString($hashBytes)).Replace("-", "")
}
finally {
    $stream.Dispose()
    $sha256.Dispose()
}
Write-Host "Backup complete: $outputFile"
Write-Host "SHA256: $hash"
