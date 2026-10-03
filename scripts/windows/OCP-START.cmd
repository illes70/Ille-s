@echo off
rem OCP inditasa a hatterben (port 3456), majd a bongeszo megnyitasa.
cd /d "%~dp0..\.."
if not exist ".next\BUILD_ID" (
  echo Elobb futtasd a scripts\windows\install-ocp.ps1 telepitot.
  pause
  exit /b 1
)
powershell -NoProfile -Command "if (Get-NetTCPConnection -LocalPort 3456 -State Listen -ErrorAction SilentlyContinue) { exit 0 } else { Start-Process -WindowStyle Minimized -FilePath cmd.exe -ArgumentList '/c npx next start -p 3456 > .data-ocp.log 2>&1' }"
powershell -NoProfile -Command "$d=(Get-Date).AddSeconds(60); while((Get-Date) -lt $d){ try { if((Invoke-WebRequest http://localhost:3456/api/auth/status -UseBasicParsing -TimeoutSec 2).StatusCode -eq 200){ break } } catch {}; Start-Sleep 1 }"
start "" http://localhost:3456
