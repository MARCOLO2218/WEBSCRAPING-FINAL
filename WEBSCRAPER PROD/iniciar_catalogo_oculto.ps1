$ErrorActionPreference = "Stop"

$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$logDir = Join-Path $projectDir "logs"
$lastErrorFile = Join-Path $logDir "ultimo_error.txt"
$serverLogFile = Join-Path $logDir "catalogo_servidor.log"
$serverErrorFile = Join-Path $logDir "catalogo_servidor_error.log"
$installLogFile = Join-Path $logDir "instalacion_catalogo.log"

New-Item -ItemType Directory -Force -Path $logDir | Out-Null

function Get-EnvValue {
  param([string]$Name, [string]$DefaultValue)
  $envFile = Join-Path $projectDir ".env"
  if (Test-Path $envFile) {
    $line = Get-Content $envFile | Where-Object { $_ -match "^$Name=" } | Select-Object -First 1
    if ($line) { return ($line -replace "^$Name=", "").Trim() }
  }
  return $DefaultValue
}

$port = [int](Get-EnvValue "CATALOG_PORT" "3030")
$url = "http://localhost:$port"

function Show-ErrorMessage {
  param([string]$Message)
  Set-Content -Path $lastErrorFile -Value $Message -Encoding UTF8
  Add-Type -AssemblyName System.Windows.Forms
  [System.Windows.Forms.MessageBox]::Show(
    "$Message`n`nRevisa el archivo:`n$lastErrorFile",
    "Catalogo Comercial - Error",
    [System.Windows.Forms.MessageBoxButtons]::OK,
    [System.Windows.Forms.MessageBoxIcon]::Error
  ) | Out-Null
}

function Test-CatalogServer {
  try {
    $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2
    return $response.StatusCode -eq 200
  } catch {
    return $false
  }
}

function Run-CmdStep {
  param([string]$Command)
  cmd /c "$Command >> `"$installLogFile`" 2>&1"
  if ($LASTEXITCODE -ne 0) {
    throw "Fallo el comando: $Command. Revisa $installLogFile"
  }
}

try {
  Set-Location $projectDir

  if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw "Node.js no esta instalado. Instala Node.js LTS y vuelve a abrir el catalogo."
  }

  if (-not (Test-Path "node_modules")) {
    "Instalando dependencias..." | Out-File -FilePath $installLogFile -Encoding UTF8
    Run-CmdStep "npm install"
  }

  "Compilando sistema..." | Out-File -FilePath $installLogFile -Append -Encoding UTF8
  Run-CmdStep "node node_modules\typescript\bin\tsc"

  if (-not (Test-CatalogServer)) {
    Start-Process -FilePath "node" `
      -ArgumentList "dist\catalog-server.js" `
      -WorkingDirectory $projectDir `
      -WindowStyle Hidden `
      -RedirectStandardOutput $serverLogFile `
      -RedirectStandardError $serverErrorFile

    Start-Sleep -Seconds 3
  }

  if (-not (Test-CatalogServer)) {
    throw "No se pudo levantar el catalogo local en $url. Revisa si el puerto esta ocupado, si falta npm install o si fallo PostgreSQL."
  }

  Start-Process $url
} catch {
  Show-ErrorMessage $_.Exception.Message
}
