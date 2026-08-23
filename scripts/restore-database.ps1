param(
  [Parameter(Mandatory = $true)][string]$Backup,
  [switch]$ConfirmRestore
)
$ErrorActionPreference = "Stop"
if (-not $ConfirmRestore) { throw "Restore replaces current database contents. Re-run with -ConfirmRestore." }
$source = (Resolve-Path -LiteralPath $Backup).Path
if ([System.IO.Path]::GetExtension($source) -ne ".dump") { throw "Expected a .dump backup file." }
$container = "vetlinx-postgres"
$status = docker inspect -f "{{.State.Running}}" $container 2>$null
if ($status -ne "true") { throw "Container '$container' is not running." }
$containerPath = "/tmp/vetlinx-restore-$([guid]::NewGuid().ToString('N')).dump"
try {
  docker cp $source "${container}:$containerPath"
  if ($LASTEXITCODE -ne 0) { throw "docker cp failed." }
  docker exec $container pg_restore -U vetlinx -d vetlinx --clean --if-exists --no-owner --no-privileges $containerPath
  if ($LASTEXITCODE -ne 0) { throw "pg_restore failed." }
} finally {
  docker exec $container rm -f -- $containerPath 2>$null | Out-Null
}
Write-Output "Database restored from $source"
