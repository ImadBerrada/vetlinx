param([string]$Destination = ".\backups")
$ErrorActionPreference = "Stop"
$container = "vetlinx-postgres"
$status = docker inspect -f "{{.State.Running}}" $container 2>$null
if ($status -ne "true") { throw "Container '$container' is not running." }
$targetDirectory = [System.IO.Path]::GetFullPath((Join-Path $PWD $Destination))
[System.IO.Directory]::CreateDirectory($targetDirectory) | Out-Null
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$fileName = "vetlinx-$stamp.dump"
$containerPath = "/tmp/$fileName"
$hostPath = Join-Path $targetDirectory $fileName
try {
  docker exec $container pg_dump -U vetlinx -d vetlinx -Fc -f $containerPath
  if ($LASTEXITCODE -ne 0) { throw "pg_dump failed." }
  docker cp "${container}:$containerPath" $hostPath
  if ($LASTEXITCODE -ne 0) { throw "docker cp failed." }
} finally {
  docker exec $container rm -f -- $containerPath 2>$null | Out-Null
}
Write-Output $hostPath
