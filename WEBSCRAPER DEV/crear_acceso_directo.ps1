$ErrorActionPreference = "Stop"
$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$desktop = [Environment]::GetFolderPath("Desktop")
$envName = if ($projectDir -match "PROD") { "PROD" } else { "DEV" }
$linkPath = Join-Path $desktop "Catalogo Comercial FACENCO $envName.lnk"
$target = Join-Path $projectDir "INICIAR_CATALOGO.vbs"
$icon = Join-Path $projectDir "assets\facenco.ico"

$wsh = New-Object -ComObject WScript.Shell
$link = $wsh.CreateShortcut($linkPath)
$link.TargetPath = $target
$link.WorkingDirectory = $projectDir
$link.Description = "Catalogo Comercial FACENCO $envName"
if (Test-Path $icon) { $link.IconLocation = $icon }
$link.Save()
Write-Host "Acceso directo creado:" $linkPath
