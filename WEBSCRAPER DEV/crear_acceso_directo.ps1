$ErrorActionPreference = "Stop"
$projectDir = $PSScriptRoot
$desktop = [Environment]::GetFolderPath("Desktop")
$envName = if ($projectDir -match "PROD") { "PROD" } else { "DEV" }
$linkPath = Join-Path $desktop "Catalogo Comercial FACENCO $envName.lnk"
$target = Join-Path $projectDir "INICIAR_CATALOGO.vbs"
$icon = Join-Path $projectDir "assets\facenco.ico"

if (!(Test-Path -LiteralPath $target)) {
  throw "No existe el archivo de inicio: $target"
}

if (!(Test-Path -LiteralPath $icon)) {
  throw "No existe el icono: $icon"
}

if (Test-Path -LiteralPath $linkPath) {
  Remove-Item -LiteralPath $linkPath -Force
}

$wsh = New-Object -ComObject WScript.Shell
$link = $wsh.CreateShortcut($linkPath)
$link.TargetPath = $target
$link.WorkingDirectory = $projectDir
$link.Description = "Catalogo Comercial FACENCO $envName"
$link.IconLocation = "$icon,0"
$link.Save()

Write-Host "Acceso directo creado:" $linkPath -ForegroundColor Green
Write-Host "Icono usado:" $icon -ForegroundColor Green
Write-Host ""
Write-Host "Si Windows todavia muestra el icono anterior, elimina el acceso viejo del escritorio y ejecuta de nuevo este archivo." -ForegroundColor Yellow
