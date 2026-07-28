@echo off
setlocal
title Crear acceso directo - Catalogo FACENCO PROD

set "SERVIDOR=http://172.16.247.6:3031/"
set "NOMBRE=Catalogo Comercial FACENCO PROD.url"
set "ICONO=%~dp0assets\facenco.ico"

for /f "usebackq delims=" %%D in (`powershell.exe -NoProfile -Command "[Environment]::GetFolderPath('Desktop')"`) do set "ESCRITORIO=%%D"

if not defined ESCRITORIO (
  echo.
  echo ERROR: No se pudo localizar el Escritorio de Windows.
  pause
  exit /b 1
)

if not exist "%ICONO%" (
  echo.
  echo ERROR: No se encontro el icono:
  echo %ICONO%
  pause
  exit /b 1
)

if exist "%ESCRITORIO%\Catalogo Comercial FACENCO PROD.lnk" del /F /Q "%ESCRITORIO%\Catalogo Comercial FACENCO PROD.lnk"
if exist "%ESCRITORIO%\%NOMBRE%" del /F /Q "%ESCRITORIO%\%NOMBRE%"

> "%ESCRITORIO%\%NOMBRE%" echo [InternetShortcut]
>> "%ESCRITORIO%\%NOMBRE%" echo URL=%SERVIDOR%
>> "%ESCRITORIO%\%NOMBRE%" echo IconFile=%ICONO%
>> "%ESCRITORIO%\%NOMBRE%" echo IconIndex=0

if errorlevel 1 (
  echo.
  echo ERROR: No fue posible crear el acceso directo.
  pause
  exit /b 1
)

echo.
echo Acceso directo PROD creado correctamente.
echo Servidor: %SERVIDOR%
echo Ubicacion: %ESCRITORIO%\%NOMBRE%
echo.
echo No se instalo ningun programa en esta computadora.
pause
exit /b 0
