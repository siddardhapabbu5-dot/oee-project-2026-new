@echo off
title Nakshatra OEE - Dev Server
cd /d "%~dp0"
echo Starting OEE (database + API + frontend)...
echo Keep this window open while using the app.
echo.
npm run dev
pause
