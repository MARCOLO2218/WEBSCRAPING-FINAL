# Ejecutado por el usuario: prepara sólo archivos del manifiesto. No commit/push.
$ErrorActionPreference = 'Stop'
$releaseRepo = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..')).Path
$releaseManifest = Join-Path $releaseRepo 'WEBSCRAPER DEV\deploy\auth-release-files.json'
$releaseParsedFiles = ConvertFrom-Json -InputObject (Get-Content -LiteralPath $releaseManifest -Raw)
$releaseFiles = @($releaseParsedFiles | ForEach-Object { [string]$_ })
if ($releaseFiles.Count -eq 0) { throw 'Manifiesto vacío.' }
foreach ($releaseFile in $releaseFiles) {
    if ($releaseFile -notmatch '^WEBSCRAPER DEV/[a-zA-Z0-9_./-]+$' -or $releaseFile.Contains('..')) {
        throw 'Ruta inesperada en manifiesto.'
    }
    if (-not (Test-Path -LiteralPath (Join-Path $releaseRepo $releaseFile) -PathType Leaf)) {
        throw "Falta archivo: $releaseFile"
    }
}
& git -C $releaseRepo add -- $releaseFiles
if ($LASTEXITCODE -ne 0) { throw 'No se pudieron preparar los archivos.' }
& git -C $releaseRepo diff --cached --check -- $releaseFiles
if ($LASTEXITCODE -ne 0) { throw 'Revisar errores de formato antes de publicar.' }
& git -C $releaseRepo --no-pager diff --cached --stat -- $releaseFiles
if ($LASTEXITCODE -ne 0) { throw 'No se pudo revisar el paquete.' }
Write-Host "Paquete preparado: $($releaseFiles.Count) archivos del manifiesto. Sin commit ni push."
