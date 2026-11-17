param([Parameter(Mandatory=$true)][string]$BackupFile)

$resolved = (Resolve-Path -LiteralPath $BackupFile).Path
Write-Output 'Restore is destructive and requires CONFIRM_RESTORE=YES.'
if ($env:CONFIRM_RESTORE -ne 'YES') { throw 'Restore confirmation missing' }

$targetUrl = $env:RESTORE_DATABASE_URL
if (-not $targetUrl) { throw 'RESTORE_DATABASE_URL is required and must name an isolated database ending in _restore_test' }
$prepareScript = Join-Path $PSScriptRoot '..\web\scripts\prepare-restore.mjs'
& node $prepareScript
if ($LASTEXITCODE -ne 0) { throw 'Could not prepare an empty restore schema' }
$pgRestore = Join-Path $PSScriptRoot '..\.runtime\postgresql\pgsql\bin\pg_restore.exe'
if (-not (Test-Path -LiteralPath $pgRestore)) { $pgRestore = (Get-Command pg_restore -ErrorAction Stop).Source }
$nativeUrl = $targetUrl -replace '([?&])schema=[^&]+&', '$1' -replace '\?schema=[^&]+$', ''
& $pgRestore --dbname=$nativeUrl --clean --if-exists --no-owner --exit-on-error $resolved
if ($LASTEXITCODE -ne 0) { throw 'Database restore failed' }

Write-Output "Restore completed from $resolved"
