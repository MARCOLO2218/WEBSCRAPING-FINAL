@echo off
setlocal
chcp 65001 >nul

echo ============================================================
echo  INSTALACION SCRAPER 6 - DEV Y PROD
echo ============================================================
echo.
echo Requisito previo: Node.js LTS instalado.
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js no esta instalado.
  echo Instala Node.js LTS desde https://nodejs.org/
  pause
  exit /b 1
)

for %%P in ("WEBSCRAPER DEV" "WEBSCRAPER PROD") do (
  echo ============================================================
  echo Instalando %%~P
  echo ============================================================
  cd /d "%~dp0%%~P"
  call npm install
  if errorlevel 1 exit /b 1
  call npx playwright install chromium
  if errorlevel 1 exit /b 1
  call node node_modules\typescript\bin\tsc
  if errorlevel 1 exit /b 1
)

echo.
echo Instalacion completada.
pause
