# Supervision TaskForce (Prometheus + Grafana)

Pile de supervision **sur la VM2 (frontend)**, qui a de la marge RAM ; la VM1 (backend + IA +
Keycloak + Postgres + MinIO) tourne à ~175 Mio libres et ne reçoit que des exportateurs légers.

```
   ┌─ VM2 (frontend, 100.120.222.10) ──────────────┐        ┌─ VM1 (backend, 100.122.50.25) ─┐
   │  Grafana :3001  ← Prometheus :9090             │        │  node-exporter  :9100          │
   │       ↑ menu de dashboards      │  scrape ─────┼─Tailscale┼─→ cadvisor      :8081          │
   │  node-exporter · cadvisor       ↓              │        │  socat 9101 → backend:8080     │
   └────────────────────────────────────────────────┘        └────────────────────────────────┘
```

- **Accès Grafana** : `http://100.120.222.10:3001` (via Tailscale — rien n'est public).
- **Un seul point d'entrée**, un menu de dashboards : dossier *TaskForce* (vue d'ensemble maison) +
  les dashboards communautaires (Node Exporter Full, cAdvisor, JVM Micrometer) chargés au déploiement.
- Les ports VM1 sont liés à l'IP Tailscale uniquement (`100.122.50.25:910x`), jamais `0.0.0.0`.

## Déploiement

### VM1 (exportateurs)
```bash
mkdir -p ~/monitoring/vm1 && cp monitoring/vm1/docker-compose.exporters.yml ~/monitoring/vm1/
cd ~/monitoring/vm1 && docker compose -f docker-compose.exporters.yml up -d
```

### VM2 (Prometheus + Grafana)
```bash
mkdir -p ~/monitoring && cp -r monitoring/vm2 ~/monitoring/
cd ~/monitoring/vm2
cp .env.example .env && sed -i "s/GRAFANA_ADMIN_PASSWORD=/GRAFANA_ADMIN_PASSWORD=$(openssl rand -hex 16)/" .env
# alertes -> Discord : créer la config depuis l'exemple, puis y coller l'URL du webhook Discord
cp alertmanager/alertmanager.example.yml alertmanager/alertmanager.yml
# ... éditer alertmanager/alertmanager.yml : remplacer webhook_url par l'URL réelle (fichier gitignoré)
# dashboards communautaires (best-effort, nécessite l'accès sortant)
bash fetch-dashboards.sh
docker compose -f docker-compose.monitoring.yml up -d
```

## Métriques produit (datasource PostgreSQL)

Suivi de l'**évolution du produit** (utilisateurs, répartition par plan, inscriptions dans le
temps, dernière activité) via des **vues read-only** `metrics.*`. Les métriques **excluent** le
compte de Pierre, les comptes de démo (`keycloak_id 'seed-%'`) et les workspaces de démo.

```
 Grafana (VM2) --(datasource Postgres)--> socat 9102 (Tailscale) --> taskforce-postgres-prod:5432
     lit les vues metrics.* en tant que role grafana_ro (lecture seule, borne au schema metrics)
```

### VM1 - rôle read-only + vues + relais

```bash
# Depuis le repo cloné sur la VM1. POSTGRES_USER / POSTGRES_DB = ceux de .env.prod.
PW=$(openssl rand -hex 24)
docker exec -i taskforce-postgres-prod \
  psql -v ON_ERROR_STOP=1 -v grafana_pw="'$PW'" \
       -U "$POSTGRES_USER" -d "$POSTGRES_DB" < monitoring/vm1/metrics/grafana-metrics.sql
echo "grafana_ro : $PW"   # à reporter dans ~/monitoring/vm2/.env (GRAFANA_PG_PASSWORD)

# Relais socat Postgres (lié à l'IP Tailscale uniquement) : recharge les exporters
cp monitoring/vm1/docker-compose.exporters.yml ~/monitoring/vm1/
cd ~/monitoring/vm1 && docker compose -f docker-compose.exporters.yml up -d
```

### VM2 - datasource + dashboard

```bash
cd ~/monitoring/vm2
# .env : renseigner GRAFANA_PG_PASSWORD (= PW ci-dessus) et GRAFANA_PG_DB (= POSTGRES_DB de la VM1)
cp -r <repo>/monitoring/vm2/grafana ~/monitoring/vm2/     # datasource + dashboard taskforce-product.json
docker compose -f docker-compose.monitoring.yml up -d
```

Dashboard : Grafana → dossier **TaskForce** → **« TaskForce - Produit »**.

- **Sécurité** : Postgres n'est joignable que sur le **tailnet** (socat lié à `100.122.50.25`), le rôle
  `grafana_ro` est en **lecture seule** et borné au schéma `metrics` ; les vues tournent avec les droits
  de leur propriétaire (pas d'accès direct aux tables `public.*`) et **aucune n'expose de secret**.
- Les exclusions (toi, démo) vivent dans `monitoring/vm1/metrics/grafana-metrics.sql` (vue `metrics.real_users`).

## Alertes

- **9 règles** (`prometheus/rules/taskforce-alerts.yml`, chargées via `rule_files:`) en 4 familles :
  disponibilité, erreurs/latence, saturation, sécurité (pics de 401 login et de 429 rate-limit).
- **Alertmanager** les route vers **Discord** (`alertmanager/alertmanager.yml`, gitignoré car il porte
  l'URL du webhook). Rien n'est exposé : Prometheus le joint en interne (`alertmanager:9093`).
- Test : `docker exec tf-prometheus promtool check rules /etc/prometheus/rules/*.yml`, puis vérifier
  `http://100.120.222.10:3001` (Grafana) et l'onglet Alerts d'Alertmanager (interne).

## Notes

- **Le backend expose déjà `/actuator/prometheus`** (Micrometer) ; `/actuator/**` est public
  (`SecurityConfig`). Le relais `socat` évite de republier le port 8080 du backend / de le recréer.
- Retention Prometheus : 15 jours (`--storage.tsdb.retention.time`).
- Pour exposer Grafana publiquement plus tard : ajouter un hostname au tunnel Cloudflare de la VM2
  vers `http://tf-grafana:3000` — **pas** un port ouvert sur Internet.
