@echo off
REM ===============================
REM Lanceur pour les scripts bash
REM ===============================

echo Demarrage avec Git Bash...
echo.

REM Vérifier si Git Bash est installé
where git >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ERREUR: Git n'est pas installe ou pas dans le PATH
    echo Installez Git for Windows: https://git-scm.com/download/win
    pause
    exit /b 1
)

REM Lancer le script avec Git Bash
"C:\Program Files\Git\bin\bash.exe" scripts/start-dev.sh

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo Une erreur s'est produite
    pause
)
