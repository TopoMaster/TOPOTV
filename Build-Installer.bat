@echo off
setlocal
cd /d "%~dp0"
echo [1/3] Compilando la web...
call npm ci || goto :err
call npm run build || goto :err
echo [2/3] Preparando la app de escritorio...
cd desktop
call npm ci || goto :err
echo [3/3] Generando el instalador (puede tardar unos minutos)...
call npm run dist || goto :err
echo.
cd ..
echo Instalador generado en artifacts\windows
start "" "artifacts\windows"
pause
exit /b 0
:err
echo ERROR: revisa los mensajes anteriores.
pause
exit /b 1
