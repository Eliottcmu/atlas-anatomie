@echo off
rem Mode développement : lanceur Go (fiches, ronéos) + interface Vite avec rechargement à chaud.
rem Pour l'usage courant, préférer l'appli : distribution\Atlas-anatomie-Windows.zip
rem (construite par python -I pipeline\construire_appli.py).
chcp 65001 >nul
setlocal
cd /d "%~dp0"
title Atlas d'anatomie (développement)

echo.
echo   Atlas d'anatomie, mode développement
echo   ------------------------------------
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [FAIL] Node.js est introuvable. Action : installer Node.js LTS ^(winget install OpenJS.NodeJS.LTS^).
  goto fin
)
if not exist "app\node_modules\three" (
  echo [WARN] Dépendances absentes. Conséquence : installation, une minute environ.
  pushd app
  call npm ci --no-fund --no-audit
  popd
)
echo [OK] Node.js et dépendances présents.

python -I pipeline\construire_appli.py --dev
if errorlevel 1 (
  echo [FAIL] Construction du lanceur en échec. Action : lire le message ci-dessus.
  goto fin
)

echo [OK] Démarrage du lanceur ^(port 8765^) et de l'interface ^(http://localhost:5173^).
echo      Pour arrêter : fermer cette fenêtre.
echo.
start "" /b "construction\lanceur-dev.exe" -racine-projet . -sans-navigateur -arret-inactivite 0
rem ATLAS_SANS_NAVIGATEUR=1 : ne pas ouvrir le navigateur (tests automatiques)
if not defined ATLAS_SANS_NAVIGATEUR start "" /b cmd /c "timeout /t 3 /nobreak >nul & start "" http://localhost:5173"
pushd app
call npm run dev --silent
popd

:fin
echo.
pause
