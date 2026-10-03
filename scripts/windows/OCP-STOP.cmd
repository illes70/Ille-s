@echo off
rem OCP leallitasa (a 3456-os porton futo szerver).
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 3456 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"
echo OCP leallitva.
timeout /t 2 >nul
