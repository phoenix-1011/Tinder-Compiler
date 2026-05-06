@echo off
setlocal

cd /d "%~dp0.."

if "%ELECTRON_MIRROR%"=="" set "ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/"
if "%npm_config_electron_mirror%"=="" set "npm_config_electron_mirror=%ELECTRON_MIRROR%"
if "%ELECTRON_OVERRIDE_DIST_PATH%"=="" if exist "D:\Electron\electron.exe" set "ELECTRON_OVERRIDE_DIST_PATH=D:\Electron"
if "%ELECTRON_EXEC_PATH%"=="" if exist "D:\Electron\electron.exe" set "ELECTRON_EXEC_PATH=D:\Electron\electron.exe"

where pnpm.cmd >nul 2>nul
if errorlevel 1 (
  echo pnpm.cmd was not found. Please install pnpm or enable it through Corepack.
  exit /b 1
)

if not exist "node_modules" (
  echo Installing dependencies...
  call pnpm.cmd install --frozen-lockfile --prefer-offline
  if errorlevel 1 exit /b %errorlevel%
)

if not "%ELECTRON_EXEC_PATH%"=="" if exist "%ELECTRON_EXEC_PATH%" (
  echo Using Electron runtime from %ELECTRON_EXEC_PATH%
  goto start_app
)

if not exist "apps\desktop\node_modules\electron\dist\electron.exe" (
  echo Electron runtime is missing. Rebuilding electron package...
  call pnpm.cmd rebuild electron
  if errorlevel 1 exit /b %errorlevel%
)

if not exist "apps\desktop\node_modules\electron\dist\electron.exe" (
  echo Electron runtime is still missing. Running electron installer directly...
  node apps\desktop\node_modules\electron\install.js
  if errorlevel 1 exit /b %errorlevel%
)

if not exist "apps\desktop\node_modules\electron\dist\electron.exe" (
  echo Electron runtime was not installed. Check ELECTRON_MIRROR or provide an internal Electron mirror.
  exit /b 1
)

:start_app
call pnpm.cmd desktop:dev
