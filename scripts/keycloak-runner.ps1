<#
.SYNOPSIS
    Provisionne dans Keycloak le compte de service d'un runner local de délégation (ADR-013), de façon
    idempotente, puis dépose ses identifiants dans le fichier d'environnement du runner.

.DESCRIPTION
    Un runner local (Claude Code sur le poste d'une personne) s'authentifie comme une MACHINE, jamais avec
    le mot de passe de la personne. Ce script crée ce qu'il faut pour cela :

      1. le rôle de realm `delivery-runner` ;
      2. un client confidentiel `tf-runner-<Name>`, réduit au grant `client_credentials` (aucun flux
         navigateur, aucun password grant) ;
      3. le rôle, porté par le compte de service de ce client ;
      4. un mapper « hardcoded claim » qui signe dans le jeton le PROPRIÉTAIRE du runner
         (`tf_runner_owner`). Le backend ne laisse le runner agir que pour cette personne, et seulement
         sur les runs qu'elle a elle-même délégués. Seul un administrateur du realm peut changer ce claim.

    Pourquoi un script et non une modification du fichier de realm : le fichier n'est importé qu'à la
    PREMIÈRE création du volume Keycloak (même raison que scripts/keycloak-idp.ps1). Le script agit sur
    l'instance en cours et se rejoue après un reset.

    Le secret du client n'est JAMAIS affiché ni journalisé : il est écrit directement dans le fichier
    d'environnement du runner, qui est ignoré par git.

.PARAMETER Owner
    E-mail TaskForce de la personne pour qui le runner travaille (son compte doit exister).

.PARAMETER Name
    Suffixe du client Keycloak : `tf-runner-<Name>`. Minuscules, chiffres et tirets.

.PARAMETER RotateSecret
    Régénère le secret du client (l'ancien cesse de fonctionner immédiatement).

.PARAMETER TokenLifespanMinutes
    Durée de vie du jeton machine, propre à ce client (défaut 60). Plus courte = révocation plus rapide,
    mais aussi durée maximale d'un run plus courte.

.EXAMPLE
    .\scripts\keycloak-runner.ps1 -Owner admin@taskforce.dev -Name pierre

.NOTES
    Révoquer un runner : désactiver ou supprimer le client `tf-runner-<Name>` dans Keycloak. Ses jetons
    déjà émis expirent avec la durée de vie des access tokens du realm.
#>
param(
    [Parameter(Mandatory = $true)]
    [string]$Owner,

    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[a-z0-9][a-z0-9-]{1,40}$')]
    [string]$Name,

    [switch]$RotateSecret,

    # Durée de vie du jeton machine. Elle borne deux choses : la durée maximale d'un run (l'agent reçoit un
    # jeton neuf au départ et doit finir avant son expiration) et le délai de révocation d'un runner.
    [ValidateRange(10, 240)]
    [int]$TokenLifespanMinutes = 60,

    [string]$EnvFile = '.env.dev',
    [string]$KeycloakContainer = 'taskforce-keycloak-dev',
    [string]$RunnerEnvFile = 'taskforce-runner/.env',
    [string]$ApiUrl = 'http://localhost:8080/api'
)

# Pas de `$ErrorActionPreference = 'Stop'` : kcadm écrit ses traces sur stderr, que PowerShell 5.1
# transforme en ErrorRecord. On contrôle `$LASTEXITCODE` après chaque appel (cf. keycloak-idp.ps1).
$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$RoleName   = 'delivery-runner'
$OwnerClaim = 'tf_runner_owner'
$MapperName = 'tf-runner-owner'
$ClientId   = "tf-runner-$Name"

if ($Owner -notmatch '^[^@\s]+@[^@\s]+\.[^@\s]+$') {
    Write-Host "Owner doit etre une adresse e-mail : $Owner" -ForegroundColor Red
    exit 2
}
$Owner = $Owner.Trim().ToLowerInvariant()

function Invoke-Kcadm {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$KcadmArgs)
    return (& docker exec $KeycloakContainer /opt/keycloak/bin/kcadm.sh @KcadmArgs 2>&1 | Out-String)
}

# stdout seul (pas de fusion stderr) pour un JSON parsable.
function Get-KcadmJson([string[]]$KcadmArgs) {
    return (& docker exec $KeycloakContainer /opt/keycloak/bin/kcadm.sh @KcadmArgs 2>$null | Out-String)
}

function Get-EnvValue([string]$name) {
    $fromEnv = [Environment]::GetEnvironmentVariable($name)
    if ($fromEnv) { return $fromEnv }
    if (-not (Test-Path $EnvFile)) { return $null }
    $line = Select-String -Path $EnvFile -Pattern "^$name=" -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $line) { return $null }
    return ($line.Line -replace "^$name=", '').Trim()
}

# Crée une ressource depuis un objet : JSON SANS BOM côté hôte, copié dans le conteneur (un pipe stdin
# depuis PowerShell 5.1 ajoute un BOM que Keycloak refuse). Aucun secret ne passe par ces fichiers.
function New-KcadmFromObject([string]$ResourcePath, $Object) {
    $json = $Object | ConvertTo-Json -Depth 10
    $tmpHost = Join-Path $env:TEMP ("kc-" + [guid]::NewGuid().ToString('N') + ".json")
    [System.IO.File]::WriteAllText($tmpHost, $json, (New-Object System.Text.UTF8Encoding($false)))
    $tmpCont = "/tmp/kc-runner.json"
    docker cp $tmpHost "$($KeycloakContainer):$tmpCont" | Out-Null
    $out = (& docker exec $KeycloakContainer /opt/keycloak/bin/kcadm.sh create $ResourcePath -r $realm -f $tmpCont 2>&1 | Out-String)
    $ok = ($LASTEXITCODE -eq 0)
    docker exec -u root $KeycloakContainer rm -f $tmpCont 2>&1 | Out-Null
    Remove-Item $tmpHost -ErrorAction SilentlyContinue
    if (-not $ok) { Write-Host $out -ForegroundColor Yellow }
    return $ok
}

$realm     = Get-EnvValue 'KEYCLOAK_REALM';          if (-not $realm)     { $realm = 'taskforce-dev' }
$adminUser = Get-EnvValue 'KEYCLOAK_ADMIN_USERNAME'; if (-not $adminUser) { $adminUser = 'admin' }
$adminPass = Get-EnvValue 'KEYCLOAK_ADMIN_PASSWORD'
if (-not $adminPass) {
    Write-Host "KEYCLOAK_ADMIN_PASSWORD introuvable dans l'environnement ni dans $EnvFile." -ForegroundColor Red
    exit 2
}

Write-Host "==> Authentification aupres de Keycloak (realm $realm)" -ForegroundColor Cyan
$sortie = Invoke-Kcadm config credentials --server http://localhost:8080 --realm master `
    --user $adminUser --password $adminPass
if ($LASTEXITCODE -ne 0) {
    Write-Host "Echec d'authentification :" -ForegroundColor Red
    Write-Host $sortie
    exit 1
}

# ── 1. Rôle de realm ─────────────────────────────────────────────────────────
Invoke-Kcadm get "roles/$RoleName" -r $realm | Out-Null
if ($LASTEXITCODE -eq 0) {
    Write-Host "==> Role '$RoleName' deja present"
} else {
    Write-Host "==> Creation du role '$RoleName'" -ForegroundColor Green
    $res = Invoke-Kcadm create roles -r $realm -s "name=$RoleName" `
        -s "description=Runner local de delegation TaskForce (ADR-013) : compte de service uniquement"
    if ($LASTEXITCODE -ne 0) { Write-Host $res -ForegroundColor Red; exit 1 }
}

# ── 2. Client confidentiel, client_credentials uniquement ────────────────────
function Get-ClientUuid {
    $found = (Get-KcadmJson @('get', 'clients', '-r', $realm, '-q', "clientId=$ClientId", '--fields', 'id,clientId')) | ConvertFrom-Json
    $exact = $found | Where-Object { $_.clientId -eq $ClientId } | Select-Object -First 1
    if ($exact) { return $exact.id }
    return $null
}

$clientUuid = Get-ClientUuid
$champs = @(
    '-s', 'enabled=true',
    '-s', 'publicClient=false',
    '-s', 'serviceAccountsEnabled=true',
    # Aucun flux interactif : ce client ne sert qu'a obtenir un jeton machine.
    '-s', 'standardFlowEnabled=false',
    '-s', 'implicitFlowEnabled=false',
    '-s', 'directAccessGrantsEnabled=false',
    '-s', "description=Runner local de delegation (ADR-013) - proprietaire : $Owner"
)
if ($clientUuid) {
    Write-Host "==> Client '$ClientId' deja present : mise a jour" -ForegroundColor Yellow
    $res = Invoke-Kcadm update "clients/$clientUuid" -r $realm @champs
} else {
    Write-Host "==> Creation du client '$ClientId'" -ForegroundColor Green
    $res = Invoke-Kcadm create clients -r $realm -s "clientId=$ClientId" @champs
}
if ($LASTEXITCODE -ne 0) { Write-Host $res -ForegroundColor Red; exit 1 }
if (-not $clientUuid) { $clientUuid = Get-ClientUuid }
if (-not $clientUuid) { Write-Host "Client '$ClientId' introuvable apres creation." -ForegroundColor Red; exit 1 }

# Durée de vie du jeton PROPRE à ce client, au lieu d'hériter de celle du realm (480 min mesurées en dev).
# L'attribut porte des points dans son nom : on passe par un fichier fusionné (-m), pas par `-s`, dont les
# guillemets imbriqués ne survivent pas à PowerShell 5.1. Aucun secret dans ce fichier.
$lifespan = [pscustomobject]@{ attributes = [pscustomobject]@{ 'access.token.lifespan' = "$($TokenLifespanMinutes * 60)" } }
$tmpHost = Join-Path $env:TEMP ("kc-" + [guid]::NewGuid().ToString('N') + ".json")
[System.IO.File]::WriteAllText($tmpHost, ($lifespan | ConvertTo-Json -Depth 5), (New-Object System.Text.UTF8Encoding($false)))
docker cp $tmpHost "$($KeycloakContainer):/tmp/kc-runner-lifespan.json" | Out-Null
$res = Invoke-Kcadm update "clients/$clientUuid" -r $realm -f /tmp/kc-runner-lifespan.json -m
$lifespanOk = ($LASTEXITCODE -eq 0)
docker exec -u root $KeycloakContainer rm -f /tmp/kc-runner-lifespan.json 2>&1 | Out-Null
Remove-Item $tmpHost -ErrorAction SilentlyContinue
if (-not $lifespanOk) { Write-Host $res -ForegroundColor Red; exit 1 }
Write-Host "==> Duree de vie du jeton machine : $TokenLifespanMinutes min"

# ── 3. Rôle porté par le compte de service ───────────────────────────────────
$sa = (Get-KcadmJson @('get', "clients/$clientUuid/service-account-user", '-r', $realm, '--fields', 'id,username')) | ConvertFrom-Json
if (-not $sa.id) { Write-Host "Compte de service introuvable pour '$ClientId'." -ForegroundColor Red; exit 1 }
$res = Invoke-Kcadm add-roles -r $realm --uid $sa.id --rolename $RoleName
if ($LASTEXITCODE -ne 0) { Write-Host $res -ForegroundColor Red; exit 1 }
Write-Host "==> Role '$RoleName' porte par $($sa.username)"

# ── 4. Propriétaire signé dans le jeton ──────────────────────────────────────
# Supprimé puis recréé : la valeur suit toujours -Owner, y compris quand on rejoue avec un autre e-mail.
$mappers = (Get-KcadmJson @('get', "clients/$clientUuid/protocol-mappers/models", '-r', $realm)) | ConvertFrom-Json
foreach ($m in ($mappers | Where-Object { $_.name -eq $MapperName })) {
    Invoke-Kcadm delete "clients/$clientUuid/protocol-mappers/models/$($m.id)" -r $realm | Out-Null
}
$mapper = [pscustomobject]@{
    name           = $MapperName
    protocol       = 'openid-connect'
    protocolMapper = 'oidc-hardcoded-claim-mapper'
    config         = [pscustomobject]@{
        'claim.name'           = $OwnerClaim
        'claim.value'          = $Owner
        'jsonType.label'       = 'String'
        'access.token.claim'   = 'true'
        'id.token.claim'       = 'false'
        'userinfo.token.claim' = 'false'
    }
}
if (-not (New-KcadmFromObject "clients/$clientUuid/protocol-mappers/models" $mapper)) {
    Write-Host "Echec de la creation du mapper '$MapperName'." -ForegroundColor Red
    exit 1
}
Write-Host "==> Proprietaire signe dans le jeton : $OwnerClaim = $Owner"

# ── 5. Secret : jamais affiché, écrit dans le fichier d'environnement du runner ──
if ($RotateSecret) {
    Write-Host "==> Rotation du secret" -ForegroundColor Yellow
    Invoke-Kcadm create "clients/$clientUuid/client-secret" -r $realm | Out-Null
}
$secret = ((Get-KcadmJson @('get', "clients/$clientUuid/client-secret", '-r', $realm, '--fields', 'value')) | ConvertFrom-Json).value
if (-not $secret) { Write-Host "Secret du client illisible." -ForegroundColor Red; exit 1 }

$runnerEnvPath = Join-Path $root $RunnerEnvFile
$runnerEnvDir = Split-Path -Parent $runnerEnvPath
if (-not (Test-Path $runnerEnvDir)) { New-Item -ItemType Directory -Force $runnerEnvDir | Out-Null }

# Garde-fou : on n'écrit un secret que dans un fichier que git ignore.
& git -C $root check-ignore -q -- $RunnerEnvFile
if ($LASTEXITCODE -ne 0) {
    Write-Host "Refus : '$RunnerEnvFile' n'est pas ignore par git, le secret pourrait etre committe." -ForegroundColor Red
    exit 1
}

# Les autres lignes du fichier sont conservées ; seules ces trois clés sont (ré)écrites.
$keep = @()
if (Test-Path $runnerEnvPath) {
    $keep = Get-Content $runnerEnvPath | Where-Object {
        $_ -notmatch '^(TASKFORCE_API_URL|TASKFORCE_RUNNER_CLIENT_ID|TASKFORCE_RUNNER_CLIENT_SECRET)='
    }
}
$lines = @(
    "TASKFORCE_API_URL=$ApiUrl",
    "TASKFORCE_RUNNER_CLIENT_ID=$ClientId",
    "TASKFORCE_RUNNER_CLIENT_SECRET=$secret"
) + $keep
[System.IO.File]::WriteAllLines($runnerEnvPath, $lines, (New-Object System.Text.UTF8Encoding($false)))
$secret = $null

Write-Host ""
Write-Host "Runner '$ClientId' pret (realm $realm, proprietaire $Owner)." -ForegroundColor Green
Write-Host "Identifiants ecrits dans $RunnerEnvFile (ignore par git, secret non affiche)."
Write-Host ""
Write-Host "Verification :" -ForegroundColor Cyan
Write-Host "  cd taskforce-runner ; npm run check"
