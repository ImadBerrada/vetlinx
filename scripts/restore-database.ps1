param(
  [Parameter(Mandatory = $true)][string]$Backup,
  [switch]$ConfirmRestore,
  [ValidatePattern('^[A-Za-z0-9][A-Za-z0-9_.-]*$')][string]$Container = "vetlinx-postgres",
  [ValidatePattern('^[A-Za-z0-9_]+$')][string]$Database = "vetlinx",
  [ValidatePattern('^[A-Za-z0-9_]+$')][string]$DatabaseUser = "vetlinx"
)
$ErrorActionPreference = "Stop"
if (-not $ConfirmRestore) { throw "Restore replaces current database contents. Re-run with -ConfirmRestore." }
$source = (Resolve-Path -LiteralPath $Backup).Path
if ([System.IO.Path]::GetExtension($source) -ne ".dump") { throw "Expected a .dump backup file." }
$manifestPath = "$source.manifest.json"
if (Test-Path -LiteralPath $manifestPath) {
  $manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
  if ((Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash -ne $manifest.sha256) { throw "Backup checksum mismatch. Restore stopped." }
}
$status = docker inspect -f "{{.State.Running}}" $Container 2>$null
if ($status -ne "true") { throw "Container '$Container' is not running." }
$containerPath = "/tmp/vetlinx-restore-$([guid]::NewGuid().ToString('N')).dump"
try {
  docker cp $source "${Container}:$containerPath"
  if ($LASTEXITCODE -ne 0) { throw "docker cp failed." }
  docker exec $Container pg_restore --list $containerPath | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Backup archive validation failed." }
  docker exec $Container pg_restore -U $DatabaseUser -d $Database --single-transaction --exit-on-error --clean --if-exists --no-owner --no-privileges $containerPath
  if ($LASTEXITCODE -ne 0) { throw "pg_restore failed." }
} finally {
  docker exec $Container rm -f -- $containerPath 2>$null | Out-Null
}
Write-Output "Database '$Database' in '$Container' restored from $source"
