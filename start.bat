@echo off
chcp 65001 >nul
title Anime Sky Web Server
echo ===================================================
echo           Anime Sky - جاري تشغيل الموقع...
echo ===================================================
echo.
echo الموقع يعمل على: http://localhost:3000
echo وأيضاً على المنفذ: http://localhost:24702
echo افتح أحد الرابطين أعلاه في متصفحك.
echo لإيقاف الخادم اضغط Ctrl + C
echo.
node app.cjs
pause
