@echo off
chcp 65001 >nul
title SueLr Studio

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js not found. Please install Node.js >= 22.12.0 first.
    pause
    exit /b 1
)

rem npm run dev remains available for manual split-terminal development.
call npm start
if %errorlevel% neq 0 pause
exit /b %errorlevel%
