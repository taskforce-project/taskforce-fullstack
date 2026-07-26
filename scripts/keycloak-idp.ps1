<#
.SYNOPSIS
    Déclare un fournisseur d'identité (GitHub, Google) dans le realm Keycloak, de façon idempotente.

.DESCRIPTION
    Pourquoi un script et non une modification du fichier de realm : `taskforce-dev-realm.json` n'est
    importé qu'à la PREMIÈRE création du volume Keycloak. L'y ajouter n'aurait aucun effet sur une
    instance déjà démarrée, et supposerait de détruire les comptes existants pour être appliqué. On
    passe donc par l'API d'administration, qui agit sur l'instance en cours.

    Le script est rejouable : si le fournisseur existe déjà, il est mis à jour au lieu d'échouer.

    Les identifiants OAuth ne sont JAMAIS écrits sur disque ni journalisés : ils sont lus depuis
    l'environnement (ou .env.dev) et transmis directement à Keycloak.

.PARAMETER Provider
    github ou google.

.PARAMETER ClientId
    Identifiant public de l'application OAuth. À défaut, lu depuis <PROVIDER>_LOGIN_CLIENT_ID.

.PARAMETER ClientSecret
    Secret de l'application OAuth. À défaut, lu depuis <PROVIDER>_LOGIN_CLIENT_SECRET.

.EXAMPLE
    .\scripts\keycloak-idp.ps1 -Provider github
    # Lit GITHUB_LOGIN_CLIENT_ID / GITHUB_LOGIN_CLIENT_SECRET dans .env.dev

.NOTES
    ⚠️ Les variables s'appellent <PROVIDER>_LOGIN_* et NON <PROVIDER>_CLIENT_* : ces dernières servent
    déjà à l'INTÉGRATION (lier des dépôts à un workspace), dont l'URL de rappel pointe vers notre API.
    Une application OAuth GitHub n'accepte qu'une seule URL de rappel, et celle de la connexion vise le
    courtier Keycloak — sur un autre hôte et un autre port. Il faut donc DEUX applications OAuth
    distinctes, d'où deux paires de variables. Les confondre casserait l'intégration existante.
#>
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('github', 'google')]
    [string]$Provider,

    [string]$ClientId,
    [string]$ClientSecret,

    [string]$EnvFile = '.env.dev',
    [string]$KeycloakContainer = 'taskforce-keycloak-dev'
)

# ⚠️ PAS de `$ErrorActionPreference = 'Stop'` ici.
#
# `kcadm.sh` écrit ses messages d'information sur stderr — « Logging into http://... as user admin »
# n'est PAS une erreur, c'est une trace. Or sous Windows PowerShell 5.1, la moindre ligne de stderr
# émise par un exécutable natif devient un ErrorRecord ; combinée à `Stop`, elle interrompt le script
# alors que la commande a parfaitement réussi. C'est exactement ce qui s'est produit au premier essai.
#
# On garde donc le comportement par défaut et on contrôle explicitement `$LASTEXITCODE` après chaque
# appel natif : le code de sortie est la seule source fiable de succès pour un programme externe.
$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

# Exécute kcadm dans le conteneur et renvoie sa sortie, stderr fondu dans stdout pour qu'il ne
# remonte pas en ErrorRecord. Le code de sortie reste lisible via $LASTEXITCODE.
function Invoke-Kcadm {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$KcadmArgs)
    return (& docker exec $KeycloakContainer /opt/keycloak/bin/kcadm.sh @KcadmArgs 2>&1 | Out-String)
}

# ── Lecture de la configuration ──────────────────────────────────────────────
function Get-EnvValue([string]$name) {
    # `$env:$name` n'est PAS une syntaxe valide : le fournisseur d'environnement n'accepte pas de nom
    # dynamique après `env:`. On passe donc par l'API .NET, seule façon de lire une variable dont le
    # nom est calculé.
    $fromEnv = [Environment]::GetEnvironmentVariable($name)
    if ($fromEnv) { return $fromEnv }
    if (-not (Test-Path $EnvFile)) { return $null }
    $line = Select-String -Path $EnvFile -Pattern "^$name=" -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $line) { return $null }
    return ($line.Line -replace "^$name=", '').Trim()
}

$upper = $Provider.ToUpper()
if (-not $ClientId)     { $ClientId     = Get-EnvValue "${upper}_LOGIN_CLIENT_ID" }
if (-not $ClientSecret) { $ClientSecret = Get-EnvValue "${upper}_LOGIN_CLIENT_SECRET" }

$realm      = Get-EnvValue 'KEYCLOAK_REALM';         if (-not $realm)      { $realm = 'taskforce-dev' }
$adminUser  = Get-EnvValue 'KEYCLOAK_ADMIN_USERNAME'; if (-not $adminUser) { $adminUser = 'admin' }
$adminPass  = Get-EnvValue 'KEYCLOAK_ADMIN_PASSWORD'

if (-not $ClientId -or -not $ClientSecret) {
    Write-Host "Identifiants OAuth manquants." -ForegroundColor Red
    Write-Host ""
    Write-Host "Renseignez dans $EnvFile :" -ForegroundColor Yellow
    Write-Host "  ${upper}_LOGIN_CLIENT_ID=..."
    Write-Host "  ${upper}_LOGIN_CLIENT_SECRET=..."
    Write-Host ""
    Write-Host "URL de rappel a declarer dans l'application OAuth $Provider :" -ForegroundColor Cyan
    Write-Host "  http://localhost:8180/realms/$realm/broker/$Provider/endpoint"
    exit 2
}
if (-not $adminPass) {
    Write-Host "KEYCLOAK_ADMIN_PASSWORD introuvable dans l'environnement ni dans $EnvFile." -ForegroundColor Red
    exit 2
}

# ── Authentification administrateur ──────────────────────────────────────────
# kcadm est exécuté DANS le conteneur : le mot de passe ne traverse pas le réseau de l'hôte, et
# `localhost:8080` y est l'adresse interne de Keycloak.
Write-Host "==> Authentification aupres de Keycloak (realm $realm)" -ForegroundColor Cyan
$sortie = Invoke-Kcadm config credentials --server http://localhost:8080 --realm master `
    --user $adminUser --password $adminPass
if ($LASTEXITCODE -ne 0) {
    Write-Host "Echec d'authentification :" -ForegroundColor Red
    Write-Host $sortie
    exit 1
}

# ── Le fournisseur existe-t-il deja ? ────────────────────────────────────────
# Un code de sortie non nul signifie ici « absent », pas « en panne » : c'est le cas nominal d'une
# première exécution. On ne le traite donc pas comme une erreur.
$lecture = Invoke-Kcadm get "identity-provider/instances/$Provider" -r $realm
$existant = ($LASTEXITCODE -eq 0) -and ($lecture -match '"alias"')

# `syncMode: IMPORT` — le profil est copié à la première connexion puis n'est plus écrasé : un
# changement de nom côté GitHub n'écrase pas ce que la personne a réglé chez nous.
# `trustEmail: true` — l'adresse est déjà vérifiée par le fournisseur ; redemander un OTP pour une
# adresse dont GitHub garantit la possession n'ajoute rien et bloque le parcours.
$defaultScopes = if ($Provider -eq 'google') { 'openid profile email' } else { 'user:email' }

# Champs passés en arguments `-s`, et NON via un fichier JSON.
#
# Motif : écrire le JSON dans le conteneur en le poussant sur stdin depuis PowerShell 5.1 y ajoute un
# BOM UTF-8 (octets 0xEF 0xBB 0xBF), et Keycloak refuse le document — « Unexpected character (code
# 65279) ». Contourner le BOM demanderait d'écrire le fichier côté hôte puis de le copier, ce qui
# ferait transiter le secret par le disque. Les arguments `-s` évitent le fichier entièrement.
$champs = @(
    '-s', "alias=$Provider",
    '-s', "providerId=$Provider",
    '-s', 'enabled=true',
    # L'adresse est déjà vérifiée par le fournisseur : redemander un OTP pour une adresse dont GitHub
    # garantit la possession n'ajoute rien et bloquerait le parcours.
    '-s', 'trustEmail=true',
    '-s', 'storeToken=false',
    '-s', "config.clientId=$ClientId",
    '-s', "config.clientSecret=$ClientSecret",
    '-s', "config.defaultScope=$defaultScopes",
    # IMPORT : le profil est copié à la première connexion puis n'est plus écrasé — un changement de
    # nom chez GitHub n'écrase pas ce que la personne a réglé chez nous.
    '-s', 'config.syncMode=IMPORT'
)

if ($existant) {
    Write-Host "==> Fournisseur '$Provider' deja present : mise a jour" -ForegroundColor Yellow
    $res = Invoke-Kcadm update "identity-provider/instances/$Provider" -r $realm @champs
} else {
    Write-Host "==> Creation du fournisseur '$Provider'" -ForegroundColor Green
    $res = Invoke-Kcadm create identity-provider/instances -r $realm @champs
}
$code = $LASTEXITCODE

if ($code -ne 0) {
    Write-Host "Echec de l'operation Keycloak :" -ForegroundColor Red
    Write-Host $res
    exit 1
}

# ── Connexion externe SILENCIEUSE : jamais d'ecran Keycloak ──────────────────
# En production, Keycloak n'est pas joignable par le navigateur (seul nginx expose des ports) : sa
# page « Update Account Information » serait une redirection cassee. On garantit donc que la creation
# de compte au premier passage se fait sans aucune interaction, par deux reglages GLOBAUX au realm
# (valables pour tout fournisseur, github comme google) :
#   1. firstName/lastName rendus optionnels — GitHub ne fournit pas toujours le nom de famille ;
#      notre propre inscription les exige deja cote application, donc aucune perte de controle ;
#   2. l'etape « review profile » du flux first-broker-login passee sur « off ».
# Ces reglages vivent dans le H2 de Keycloak et sont perdus a chaque reset : leur place est donc ici,
# rejoues avec l'IdP.

# stdout propre (pas de fusion stderr) pour un JSON parsable.
function Get-KcadmJson([string[]]$KcadmArgs) {
    return (& docker exec $KeycloakContainer /opt/keycloak/bin/kcadm.sh @KcadmArgs 2>$null | Out-String)
}

# Ecrit un objet en JSON SANS BOM cote hote, le copie dans le conteneur (docker cp evite le BOM que
# PowerShell 5.1 ajoute sur un pipe stdin, que Keycloak refuse), puis applique via `update -f`.
function Update-KcadmFromObject([string]$ResourcePath, $Object) {
    $json = $Object | ConvertTo-Json -Depth 30
    $tmpHost = Join-Path $env:TEMP ("kc-" + [guid]::NewGuid().ToString('N') + ".json")
    [System.IO.File]::WriteAllText($tmpHost, $json, (New-Object System.Text.UTF8Encoding($false)))
    $tmpCont = "/tmp/kc-upd.json"
    docker cp $tmpHost "$($KeycloakContainer):$tmpCont" | Out-Null
    & docker exec $KeycloakContainer /opt/keycloak/bin/kcadm.sh update $ResourcePath -r $realm -f $tmpCont 2>&1 | Out-Null
    $ok = ($LASTEXITCODE -eq 0)
    docker exec -u root $KeycloakContainer rm -f $tmpCont 2>&1 | Out-Null
    Remove-Item $tmpHost -ErrorAction SilentlyContinue
    return $ok
}

Write-Host "==> Connexion externe silencieuse (pas d'ecran Keycloak au premier passage)" -ForegroundColor Cyan

# 1) firstName/lastName optionnels
try {
    $prof = (Get-KcadmJson @('get','users/profile','-r',$realm)) | ConvertFrom-Json
    $modifie = $false
    foreach ($a in $prof.attributes) {
        if ($a.name -in @('firstName','lastName') -and $a.PSObject.Properties['required']) {
            $a.PSObject.Properties.Remove('required'); $modifie = $true
        }
    }
    if ($modifie) {
        if (Update-KcadmFromObject 'users/profile' $prof) { Write-Host "   firstName/lastName rendus optionnels" -ForegroundColor Green }
        else { Write-Host "   [!] echec maj du profil utilisateur" -ForegroundColor Yellow }
    } else { Write-Host "   firstName/lastName deja optionnels" }
} catch { Write-Host "   [!] profil utilisateur illisible, etape ignoree" -ForegroundColor Yellow }

# 2) review-profile = off. L'ID de la config est RESOLU dynamiquement : il est regenere a chaque
#    import de realm, donc le coder en dur casserait apres le prochain reset.
try {
    $execs = (Get-KcadmJson @('get','authentication/flows/first%20broker%20login/executions','-r',$realm)) | ConvertFrom-Json
    $review = $execs | Where-Object { $_.providerId -eq 'idp-review-profile' } | Select-Object -First 1
    if ($review -and $review.authenticationConfig) {
        $cfg = [pscustomobject]@{
            id     = $review.authenticationConfig
            alias  = 'review profile config'
            config = [pscustomobject]@{ 'update.profile.on.first.login' = 'off' }
        }
        if (Update-KcadmFromObject "authentication/config/$($review.authenticationConfig)" $cfg) {
            Write-Host "   etape 'review profile' passee sur off" -ForegroundColor Green
        } else { Write-Host "   [!] echec maj review-profile" -ForegroundColor Yellow }
    } else { Write-Host "   [!] execution review-profile introuvable, etape ignoree" -ForegroundColor Yellow }
} catch { Write-Host "   [!] flux first-broker-login illisible, etape ignoree" -ForegroundColor Yellow }

# ── Issuer fige : userinfo/token acceptes quel que soit l'hote d'appel ───────
# Le navigateur autorise sur l'URL PUBLIQUE (localhost:8180) ; le backend lit ensuite le profil
# (userinfo) par l'URL INTERNE (keycloak:8080). En hostname DYNAMIQUE, Keycloak recalcule l'issuer
# attendu d'apres l'hote de CHAQUE requete : le jeton emis au navigateur porte iss=localhost:8180,
# mais userinfo, appele sur keycloak:8080, en attend un autre → 401 « Invalid token issuer ». La
# connexion externe echoue alors APRES la creation du compte (le plus perfide : le compte existe,
# mais la session ne se cree pas). Figer le frontendUrl du realm rend l'issuer CONSTANT (= URL
# publique) quel que soit l'hote d'appel ; userinfo l'accepte des lors depuis keycloak:8080.
#
# Pourquoi ici et pas via KC_HOSTNAME (la voie « officielle » en hostname v2) : KC_HOSTNAME impose
# de RECREER le conteneur, ce qui detruit le H2 — donc l'IdP et les reglages ci-dessus. Le
# frontendUrl du realm obtient le meme resultat par l'API d'admin, sans recreation, et se rejoue
# avec le reste. (Verifie sur KC 26.5.2 : un jeton iss=localhost:8180 est accepte par userinfo
# appele sur keycloak:8080.)
$publicUrl = Get-EnvValue 'KEYCLOAK_PUBLIC_URL'; if (-not $publicUrl) { $publicUrl = 'http://localhost:8180' }
Write-Host "==> Issuer fixe du realm (frontendUrl = $publicUrl)" -ForegroundColor Cyan
$resFront = Invoke-Kcadm update "realms/$realm" -s "attributes.frontendUrl=$publicUrl"
if ($LASTEXITCODE -eq 0) {
    Write-Host "   frontendUrl fixe sur $publicUrl" -ForegroundColor Green
} else {
    Write-Host "   [!] echec du reglage frontendUrl :" -ForegroundColor Yellow
    Write-Host $resFront
}

Write-Host ""
Write-Host "Fournisseur '$Provider' configure dans le realm $realm." -ForegroundColor Green
Write-Host "URL de rappel attendue par Keycloak (a declarer chez $Provider) :" -ForegroundColor Cyan
Write-Host "  http://localhost:8180/realms/$realm/broker/$Provider/endpoint"
Write-Host ""
Write-Host "Verification :" -ForegroundColor Cyan
Write-Host "  docker exec $KeycloakContainer /opt/keycloak/bin/kcadm.sh get identity-provider/instances -r $realm --fields alias,enabled"
