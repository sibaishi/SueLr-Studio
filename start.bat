@echo off
chcp 65001 >nul
title SueLr Studio

echo.
echo   SueLr Studio
echo   =============
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo   [ERROR] Node.js not found. Please install Node.js LTS first.
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo   [INFO] Installing frontend dependencies...
    call npm install
    if %errorlevel% neq 0 exit /b %errorlevel%
)

if not exist "backend\node_modules" (
    echo   [INFO] Installing backend dependencies...
    pushd backend
    call npm install
    if %errorlevel% neq 0 exit /b %errorlevel%
    popd
)

echo   [INFO] Starting frontend and backend...
call npm run dev
