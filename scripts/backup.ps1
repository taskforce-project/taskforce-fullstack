# ============================================================
#  scripts/backup.ps1 - Sauvegarde & restauration Postgres (PS/PCA/PRA)
#  Usage :
#    .\scripts\backup.ps1 backup            # dump horodate -> backups/
#    .\scripts\backup.ps1 list              # liste les sauvegardes
#    .\scripts\backup.ps1 verify -File <f>  # verifie l'integrite d'un dump
#    .\scripts\backup.ps1 restore -File <f> # restaure un dump (destructif : --clean)
#
#  Le dump est produit EN FORMAT CUSTOM (pg_dump -Fc, compresse) DANS le conteneur, puis
#  copie via docker cp (jamais de pipe hote -> pas de corruption binaire, cf. lecon seed UTF-8).
#  Cible RPO 15 min / RTO 4 h (cf. v1/11-pca-pra/PS_PCA_PRA.md) : planifier ce script (cron/Tache).
#  NB : script en ASCII pur (PowerShell 5.1 lit les .ps1 en codepage systeme).
# ============================================================
param(
  [Parameter(Position = 0)][ValidateSet('backup', 'list', 'verify', 'restore')][string]$Action = 'backup',
  [string]$File
)
. "$PSScriptRoot\_lib.ps1"

$script:PgContainer = 'taskforce-postgres-dev'
$script:DbName      = 'taskforce-db'
$script:PgUser      = 'postgres'
$script:BackupDir   = Join-Path $script:RepoRoot 'backups'

function Assert-Container {
  docker inspect $script:PgContainer *> $null
  if ($LASTEXITCODE -ne 0) { Warn "Conteneur $script:PgContainer introuvable (stack levee ?)"; exit 1 }
}

switch ($Action) {

  'backup' {
    Assert-Container
    if (-not (Test-Path $script:BackupDir)) { New-Item -ItemType Directory -Path $script:BackupDir | Out-Null }
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $name  = "taskforce-$stamp.dump"
    $dest  = Join-Path $script:BackupDir $name
    Run "Sauvegarde $script:DbName -> backups/$name"

    docker exec $script:PgContainer sh -c "pg_dump -Fc -U $script:PgUser -d $script:DbName -f /tmp/$name"
    if ($LASTEXITCODE -ne 0) { Warn 'Echec pg_dump'; exit 1 }
    docker cp "$($script:PgContainer):/tmp/$name" "$dest" | Out-Null
    docker exec $script:PgContainer rm -f "/tmp/$name" 2>$null | Out-Null

    if (Test-Path $dest) {
      $sizeKb = [math]::Round((Get-Item $dest).Length / 1KB, 1)
      Ok "OK : $dest ($sizeKb Ko)"
    } else { Warn 'Copie du dump echouee'; exit 1 }
  }

  'list' {
    if (-not (Test-Path $script:BackupDir)) { Info 'Aucune sauvegarde.'; break }
    Run 'Sauvegardes disponibles'
    Get-ChildItem $script:BackupDir -Filter '*.dump' | Sort-Object LastWriteTime -Descending |
      ForEach-Object { Info ("{0,-32} {1,8:N1} Ko  {2}" -f $_.Name, ($_.Length / 1KB), $_.LastWriteTime) }
  }

  'verify' {
    if (-not $File -or -not (Test-Path $File)) { Warn 'Fichier introuvable (-File <chemin>)'; exit 1 }
    Assert-Container
    $bn = Split-Path $File -Leaf
    Run "Verification d'integrite : $bn"
    docker cp "$File" "$($script:PgContainer):/tmp/$bn" | Out-Null
    docker exec $script:PgContainer pg_restore --list "/tmp/$bn" *> $null
    $rc = $LASTEXITCODE
    docker exec $script:PgContainer rm -f "/tmp/$bn" 2>$null | Out-Null
    if ($rc -eq 0) { Ok 'Dump valide (table des matieres lisible).' } else { Warn 'Dump ILLISIBLE / corrompu.'; exit 1 }
  }

  'restore' {
    if (-not $File -or -not (Test-Path $File)) { Warn 'Fichier introuvable (-File <chemin>)'; exit 1 }
    Assert-Container
    $bn = Split-Path $File -Leaf
    Warn "RESTAURATION DESTRUCTIVE de $script:DbName depuis $bn (--clean --if-exists)"
    docker cp "$File" "$($script:PgContainer):/tmp/$bn" | Out-Null
    # --clean --if-exists : purge puis recree ; --no-owner : independant du role proprietaire.
    docker exec $script:PgContainer pg_restore -U $script:PgUser -d $script:DbName --clean --if-exists --no-owner "/tmp/$bn"
    $rc = $LASTEXITCODE
    docker exec $script:PgContainer rm -f "/tmp/$bn" 2>$null | Out-Null
    # pg_restore peut renvoyer un code non nul sur des warnings benins (objets deja absents) -> informatif.
    if ($rc -eq 0) { Ok 'Restauration terminee.' } else { Warn "Restauration terminee avec avertissements (code $rc) - verifier les donnees." }
  }
}
