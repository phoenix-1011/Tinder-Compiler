@echo off
setlocal

cd /d "%~dp0.."

if "%ELECTRON_MIRROR%"=="" set "ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/"
if "%npm_config_electron_mirror%"=="" set "npm_config_electron_mirror=%ELECTRON_MIRROR%"
if "%ELECTRON_OVERRIDE_DIST_PATH%"=="" if exist "D:\Electron\electron.exe" set "ELECTRON_OVERRIDE_DIST_PATH=D:\Electron"
if "%ELECTRON_EXEC_PATH%"=="" if exist "D:\Electron\electron.exe" set "ELECTRON_EXEC_PATH=D:\Electron\electron.exe"

call pnpm.cmd --filter @tinder/desktop dev
