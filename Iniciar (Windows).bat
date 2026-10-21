@echo off
rem Abre la app con un servidor local (permite instalarla y usarla sin conexion).
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0servidor.ps1"
if errorlevel 1 (
  echo No se pudo iniciar el servidor local. Abriendo la app directamente...
  start "" "%~dp0index.html"
  pause
)
