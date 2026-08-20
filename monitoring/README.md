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
# dashboards communautaires (best-effort, nécessite l'accès sortant)
bash fetch-dashboards.sh
docker compose -f docker-compose.monitoring.yml up -d
```

## Notes

- **Le backend expose déjà `/actuator/prometheus`** (Micrometer) ; `/actuator/**` est public
  (`SecurityConfig`). Le relais `socat` évite de republier le port 8080 du backend / de le recréer.
- Retention Prometheus : 15 jours (`--storage.tsdb.retention.time`).
- Pour exposer Grafana publiquement plus tard : ajouter un hostname au tunnel Cloudflare de la VM2
  vers `http://tf-grafana:3000` — **pas** un port ouvert sur Internet.
