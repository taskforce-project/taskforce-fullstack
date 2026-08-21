# Sauvegardes Postgres (prod TaskForce)

Filet de sécurité pour **reseed / expérimenter sur la prod sans risque** : on sauvegarde, on tente,
on restaure l'instantané si besoin. Léger (base ~90 Mio → dump de quelques Mio) et **borné** par
rotation (14 dumps conservés).

## Déploiement (VM1)
```bash
mkdir -p ~/ops/backup ~/backups
cp ops/backup/pg_backup.sh ops/backup/pg_restore.sh ~/ops/backup/ && chmod +x ~/ops/backup/*.sh
sudo cp ops/backup/tf-backup.service ops/backup/tf-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now tf-backup.timer
```

## Utilisation
```bash
# Sauvegarde immédiate (ex. avant un reseed)
~/ops/backup/pg_backup.sh

# Lister les sauvegardes
ls -1t ~/backups/

# Restaurer un instantané (arrête/redémarre backend+keycloak+ai-service automatiquement)
~/ops/backup/pg_restore.sh ~/backups/taskforce-cluster-AAAAMMJJ-HHMMSS.sql.gz

# État du timer / prochaine exécution
systemctl status tf-backup.timer ; systemctl list-timers tf-backup.timer
```

## Détails
- **Quand** : quotidien 03:00 (`Persistent=true` → rattrape un créneau manqué au boot).
- **Rotation** : `KEEP=14` (dans `tf-backup.service`). ~14 × quelques Mio → négligeable sur 13 Gio libres.
- **Format** : `pg_dumpall` SQL + gzip, `--clean --if-exists` — **cluster COMPLET** : bases `taskforce`,
  `keycloak_prod` (utilisateurs + IdP GitHub + secret + flows), `umami`, + les rôles. ⚠️ Keycloak vit dans
  une base **séparée** (`keycloak_prod`) : un dump mono-base l'aurait manqué. Restauration = tout ou rien.
- **Off-box (optionnel, durabilité)** : recopier `~/backups` sur la VM2 via Tailscale (`rsync`/`scp`)
  si l'on veut survivre à la perte de la VM1. Non activé par défaut (garde la VM1 légère).
