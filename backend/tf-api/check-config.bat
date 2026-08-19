@echo off
REM ===============================
REM Script de vérification de la configuration
REM ===============================

echo.
echo ================================
echo VERIFICATION CONFIGURATION TODO 1
echo ================================
echo.

REM Vérifier que .env.dev existe
if not exist ".env.dev" (
    echo [ERROR] Fichier .env.dev non trouve!
    echo Cree le fichier .env.dev a partir de .env.example
    exit /b 1
)

echo [OK] Fichier .env.dev existe

REM Vérifier que les dépendances Maven sont installées
if not exist "target" (
    echo [WARN] Dossier target non trouve
    echo Lancement de mvn clean install...
    call mvn clean install -DskipTests
) else (
    echo [OK] Dependances Maven installees
)

REM Vérifier les variables critiques
echo.
echo Verification des variables d'environnement critiques :
echo.

findstr /C:"STRIPE_API_KEY=sk_test_" .env.dev >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] STRIPE_API_KEY configuree
) else (
    echo [WARN] STRIPE_API_KEY non configuree ^(commence par sk_test_^)
    echo        Consulte CREDENTIALS_GUIDE.md
)

findstr /C:"MAIL_USERNAME=XXXX" .env.dev >nul 2>&1
if %errorlevel% equ 0 (
    echo [WARN] MAIL_USERNAME non configuree ^(encore a XXXX^)
    echo        Consulte CREDENTIALS_GUIDE.md
) else (
    echo [OK] MAIL_USERNAME configuree
)

findstr /C:"MAIL_PASSWORD=XXXX" .env.dev >nul 2>&1
if %errorlevel% equ 0 (
    echo [WARN] MAIL_PASSWORD non configuree ^(encore a XXXX^)
    echo        Consulte CREDENTIALS_GUIDE.md
) else (
    echo [OK] MAIL_PASSWORD configuree
)

echo.
echo ================================
echo RESULTAT
echo ================================
echo.
echo Si des [WARN] apparaissent :
echo   - Consulte CREDENTIALS_GUIDE.md
echo   - Complete les valeurs manquantes dans .env.dev
echo.
echo Pour demarrer l'application :
echo   mvn spring-boot:run
echo.
pause
