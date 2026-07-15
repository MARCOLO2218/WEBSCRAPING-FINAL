@echo off
setlocal
cd /d "%~dp0"
echo ============================================================
echo  CATALOGO COMERCIAL FACENCO
echo ============================================================
echo.
echo Este proceso va a abrir el catalogo local.
echo Desde la pagina puedes ejecutar el scraper y descargar el CSV.
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0iniciar_catalogo_oculto.ps1"
