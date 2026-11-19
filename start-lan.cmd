@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul || (echo Install Node.js 20 or newer on the host PC first. & pause & exit /b 1)
node server.cjs
if errorlevel 1 pause
