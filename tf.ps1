<#
  ============================================================
   TASKFORCE - CONTROL CENTER  (tf.ps1)
   Launcher unique : choisit et lance les scripts de scripts/.
   Usage :
     .\tf.ps1            -> menu interactif
     .\tf.ps1 upd        -> lance une commande par sa cle
     .\tf.ps1 help       -> liste des cles
  ============================================================
#>
[CmdletBinding()]
param([Parameter(Position=0)][string]$Command)

. "$PSScriptRoot\scripts\_lib.ps1"   # helpers + Set-Location racine + detection compose
$ScriptsDir = Join-Path $PSScriptRoot 'scripts'

# Registre : K=cle | G=groupe | L=libelle | S=script | A=action | X=arg optionnel
$script:Cmds = @(
  [pscustomobject]@{K='setup';   G='DEV';      L='Init .env + check Docker'; S='docker.ps1';   A='setup'}
  [pscustomobject]@{K='up';      G='DEV';      L='Demarrer (premier plan)';  S='docker.ps1';   A='up'}
  [pscustomobject]@{K='upd';     G='DEV';      L='Demarrer (arriere-plan)';  S='docker.ps1';   A='upd'}
  [pscustomobject]@{K='down';    G='DEV';      L='Arreter';                  S='docker.ps1';   A='down'}
  [pscustomobject]@{K='restart'; G='DEV';      L='Redemarrer';               S='docker.ps1';   A='restart'}
  [pscustomobject]@{K='rebuild'; G='DEV';      L='Rebuild + redemarrer (tout)'; S='docker.ps1'; A='rebuild'}
  [pscustomobject]@{K='rbe';     G='DEV';      L='Rebuild backend (cible)';  S='docker.ps1';   A='rebuild'; X='backend'}
  [pscustomobject]@{K='rfe';     G='DEV';      L='Rebuild frontend (cible)'; S='docker.ps1';   A='rebuild'; X='frontend'}

  [pscustomobject]@{K='logs';    G='LOGS';     L='Tous les logs';            S='docker.ps1';   A='logs'}
  [pscustomobject]@{K='logbe';   G='LOGS';     L='Logs backend';             S='docker.ps1';   A='logs'; X='backend'}
  [pscustomobject]@{K='logfe';   G='LOGS';     L='Logs frontend';            S='docker.ps1';   A='logs'; X='frontend'}

  [pscustomobject]@{K='pup';     G='PROD';     L='Demarrer PROD (-d)';       S='docker.ps1';   A='prod-up'}
  [pscustomobject]@{K='pdown';   G='PROD';     L='Arreter PROD';             S='docker.ps1';   A='prod-down'}
  [pscustomobject]@{K='prebuild';G='PROD';     L='Rebuild PROD';             S='docker.ps1';   A='prod-rebuild'}

  [pscustomobject]@{K='obs';     G='OUTILS';   L='Observabilite SigNoz';     S='docker.ps1';   A='obs'}
  [pscustomobject]@{K='obsdown'; G='OUTILS';   L='Stopper SigNoz';           S='docker.ps1';   A='obs-down'}
  [pscustomobject]@{K='scan';    G='OUTILS';   L='Scan securite complet';    S='security-scan.ps1'; A=''}
  [pscustomobject]@{K='trivy';   G='OUTILS';   L='Scan Trivy (code source)'; S='security-scan.ps1'; A='-Source'}
  [pscustomobject]@{K='semgrep'; G='OUTILS';   L='Scan SAST Semgrep';        S='security-scan.ps1'; A='-Static'}

  [pscustomobject]@{K='tfe';     G='QUALITE';  L='Tests frontend (Vitest)';  S='quality.ps1';  A='test-fe'}
  [pscustomobject]@{K='tfecov';  G='QUALITE';  L='Couverture frontend';      S='quality.ps1';  A='cov-fe'}
  [pscustomobject]@{K='tbe';     G='QUALITE';  L='Tests backend (JUnit)';    S='quality.ps1';  A='test-be'}
  [pscustomobject]@{K='tbecov';  G='QUALITE';  L='Couverture backend';       S='quality.ps1';  A='cov-be'}
  [pscustomobject]@{K='lint';    G='QUALITE';  L='Lint frontend (ESLint)';   S='quality.ps1';  A='lint'}
  [pscustomobject]@{K='bfe';     G='QUALITE';  L='Build frontend';           S='quality.ps1';  A='build-fe'}
  [pscustomobject]@{K='bbe';     G='QUALITE';  L='Build backend (jar)';      S='quality.ps1';  A='build-be'}

  [pscustomobject]@{K='psql';    G='DB/SHELL'; L='Console PostgreSQL';       S='db.ps1';       A='psql'}
  [pscustomobject]@{K='seed';    G='DB/SHELL'; L='Charger le seed demo (UTF-8 sur)'; S='db.ps1'; A='seed'}
  [pscustomobject]@{K='shbe';    G='DB/SHELL'; L='Shell backend';            S='db.ps1';       A='sh-be'}
  [pscustomobject]@{K='shkc';    G='DB/SHELL'; L='Shell Keycloak';           S='db.ps1';       A='sh-kc'}

  [pscustomobject]@{K='ps';      G='SYSTEME';  L='Conteneurs actifs';        S='docker.ps1';   A='ps'}
  [pscustomobject]@{K='urls';    G='SYSTEME';  L='Afficher les URLs';        S='docker.ps1';   A='urls'}
  [pscustomobject]@{K='clean';   G='SYSTEME';  L='Nettoyage complet';        S='docker.ps1';   A='clean'}
)

function Invoke-TfItem($c) {
  $p = Join-Path $ScriptsDir $c.S
  $hasX = (($c.PSObject.Properties.Name -contains 'X') -and $c.X)
  if ([string]::IsNullOrEmpty($c.A)) { & $p }
  elseif ($hasX) { & $p $c.A $c.X }
  else { & $p $c.A }
}

function Show-Help {
  Write-Host ''
  Write-Host '  Cles disponibles :' -ForegroundColor Cyan
  foreach ($c in $script:Cmds) { Write-Host ("   {0,-9} {1}  ({2} {3})" -f $c.K, $c.L, $c.S, $c.A) -ForegroundColor Gray }
  Write-Host ''
  Info 'Direct : .\tf.ps1 <cle>     ex: .\tf.ps1 upd'
}

function Header {
  Clear-Host
  Write-Host ''
  Write-Host '  ==============================================================' -ForegroundColor DarkCyan
  Write-Host '     TASKFORCE   ' -ForegroundColor White -NoNewline; Write-Host '|  CONTROL CENTER' -ForegroundColor Cyan
  Write-Host '     Launcher unifie - scripts/ (dev | prod | tests | securite)' -ForegroundColor DarkGray
  Write-Host '  ==============================================================' -ForegroundColor DarkCyan
  $dk = 'KO'; $dkc = 'Red'; $n = 0
  docker info *> $null
  if ($LASTEXITCODE -eq 0) {
    $dk = 'OK'; $dkc = 'Green'
    try { $n = (docker ps --filter 'name=taskforce' --format '{{.Names}}' | Measure-Object).Count } catch { $n = 0 }
  }
  Write-Host '   Docker: ' -NoNewline -ForegroundColor DarkGray
  Write-Host $dk -NoNewline -ForegroundColor $dkc
  Write-Host ("   |   Conteneurs taskforce actifs: {0}   |   compose: {1} {2}" -f $n, $script:DkExe, ($script:DkPre -join ' ')) -ForegroundColor DarkGray
  Write-Host ''
}

function Show-Menu {
  Header
  $idx = 0; $lastG = ''
  foreach ($c in $script:Cmds) {
    if ($c.G -ne $lastG) { Write-Host ''; Write-Host ("  {0}" -f $c.G) -ForegroundColor Yellow; $lastG = $c.G }
    $idx++
    Write-Host ('   {0,2}. ' -f $idx) -ForegroundColor DarkGray -NoNewline
    Write-Host ('[{0}]' -f $c.K) -ForegroundColor Green -NoNewline
    Write-Host ('  {0}' -f $c.L) -ForegroundColor White
  }
  Write-Host ''
  Write-Host '    h. ' -ForegroundColor DarkGray -NoNewline; Write-Host '[help]' -ForegroundColor Cyan -NoNewline; Write-Host '  Aide' -ForegroundColor White
  Write-Host '    0. ' -ForegroundColor DarkGray -NoNewline; Write-Host '[q]' -ForegroundColor Red -NoNewline;   Write-Host '  Quitter' -ForegroundColor White
  Write-Host ('  ' + ('-' * 60)) -ForegroundColor DarkGray
}

function Invoke-Sel([string]$sel) {
  $sel = $sel.Trim()
  if ($sel -eq '') { return $true }
  if ($sel -in @('q','0','quit','exit')) { return $false }
  if ($sel -in @('h','help','?')) { Show-Help; return $true }
  $cmd = $null
  if ($sel -match '^\d+$') {
    $i = [int]$sel
    if ($i -ge 1 -and $i -le $script:Cmds.Count) { $cmd = $script:Cmds[$i-1] }
  } else {
    $cmd = $script:Cmds | Where-Object { $_.K -eq $sel } | Select-Object -First 1
  }
  if ($null -eq $cmd) { Warn "Commande inconnue : $sel"; return $true }
  Invoke-TfItem $cmd
  return $true
}

# --- Mode direct (argument) ---
if ($PSBoundParameters.ContainsKey('Command') -and $Command) {
  if ($Command -in @('help','-h','--help')) { Show-Help; return }
  [void](Invoke-Sel $Command)
  return
}

# --- Boucle interactive ---
$loop = $true
while ($loop) {
  Show-Menu
  $sel = Read-Host '  tf >'
  $loop = Invoke-Sel $sel
  if ($loop -and $sel.Trim() -ne '' -and ($sel.Trim() -notin @('h','help','?'))) {
    Write-Host ''
    Write-Host '  (Entree pour revenir au menu)' -ForegroundColor DarkGray
    [void](Read-Host)
  }
}
Write-Host '  A bientot.' -ForegroundColor Cyan
