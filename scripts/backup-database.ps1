param(
  [string]$Destination = ".\backups",
  [ValidatePattern('^[A-Za-z0-9][A-Za-z0-9_.-]*$')][string]$Container = "vetlinx-postgres",
  [ValidatePattern('^[A-Za-z0-9_]+$')][string]$Database = "vetlinx",
  [ValidatePattern('^[A-Za-z0-9_]+$')][string]$DatabaseUser = "vetlinx"
)
$ErrorActionPreference = "Stop"
$status = docker inspect -f "{{.State.Running}}" $Container 2>$null
if ($status -ne "true") { throw "Container '$Container' is not running." }
$targetDirectory = if ([System.IO.Path]::IsPathRooted($Destination)) { [System.IO.Path]::GetFullPath($Destination) } else { [System.IO.Path]::GetFullPath((Join-Path $PWD $Destination)) }
[System.IO.Directory]::CreateDirectory($targetDirectory) | Out-Null
$stamp = [DateTime]::UtcNow.ToString("yyyyMMdd-HHmmss")
$fileName = "$Database-$stamp-$([guid]::NewGuid().ToString('N').Substring(0,8)).dump"
$containerPath = "/tmp/$fileName"
$hostPath = Join-Path $targetDirectory $fileName
try {
  docker exec $Container pg_dump -U $DatabaseUser -d $Database -Fc -f $containerPath
  if ($LASTEXITCODE -ne 0) { throw "pg_dump failed." }
  docker exec $Container pg_restore --list $containerPath | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Backup archive validation failed." }
  docker cp "${Container}:$containerPath" $hostPath
  if ($LASTEXITCODE -ne 0) { throw "docker cp failed." }
} finally {
  docker exec $Container rm -f -- $containerPath 2>$null | Out-Null
}
$manifest = [ordered]@{ database = $Database; container = $Container; createdAtUtc = [DateTime]::UtcNow.ToString('o'); file = $fileName; sha256 = (Get-FileHash -LiteralPath $hostPath -Algorithm SHA256).Hash; bytes = (Get-Item -LiteralPath $hostPath).Length }
$manifest | ConvertTo-Json | Set-Content -LiteralPath "$hostPath.manifest.json" -Encoding UTF8
Write-Output $hostPath
