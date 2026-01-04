@echo off
title Bedrock Command Center
echo ===================================
echo    BEDROCK COMMAND CENTER
echo ===================================
echo.
echo Starting server...
echo Panel: http://localhost:3000
echo.
cd /d "%~dp0"
node index.js
pause
