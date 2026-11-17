param([Parameter(Mandatory=$true)][string]$Destination)

$resolved = [System.IO.Path]::GetFullPath($Destination)
New-Item -ItemType Directory -Path $resolved -Force | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$output = Join-Path $resolved "futurex-$stamp.dump"

if (Get-Command docker -ErrorAction SilentlyContinue) {
  docker compose exec -T db pg_dump -U futurex -d futurex -Fc --file=/tmp/futurex.dump
  if ($LASTEXITCODE -ne 0) { throw 'Database backup failed inside Docker' }
  docker compose cp db:/tmp/futurex.dump $output
  if ($LASTEXITCODE -ne 0) { throw 'Could not copy database backup from Docker' }
} else {
  if (-not $env:DATABASE_URL) { throw 'DATABASE_URL is required when Docker is unavailable' }
  $pgDump = Join-Path $PSScriptRoot '..\.runtime\postgresql\pgsql\bin\pg_dump.exe'
  if (-not (Test-Path -LiteralPath $pgDump)) { $pgDump = (Get-Command pg_dump -ErrorAction Stop).Source }
  $nativeUrl = $env:DATABASE_URL -replace '([?&])schema=[^&]+&', '$1' -replace '\?schema=[^&]+$', ''
  & $pgDump --dbname=$nativeUrl --format=custom --file=$output
  if ($LASTEXITCODE -ne 0) { throw 'Database backup failed' }
}

if ((Get-Item -LiteralPath $output).Length -le 0) { throw 'Database backup is empty' }
Write-Output $output
