#!/usr/bin/env bash
# Télécharge quelques dashboards communautaires dans grafana/dashboards/ et fixe la source de données
# provisionnée (uid "prometheus"). Best-effort : un échec réseau n'empêche pas le déploiement — le
# dashboard maison « TaskForce — Overview » reste chargé quoi qu'il arrive.
set -u
cd "$(dirname "$0")"
DIR="grafana/dashboards"
mkdir -p "$DIR"

# id:nom-de-fichier  (Node Exporter Full · cAdvisor)
for entry in "1860:node-exporter-full" "14282:cadvisor"; do
  id="${entry%%:*}"; name="${entry##*:}"
  rev="$(curl -fsSL "https://grafana.com/api/dashboards/${id}" 2>/dev/null | grep -o '"revision":[0-9]*' | head -1 | grep -o '[0-9]*')"
  [ -z "${rev}" ] && rev=1
  if curl -fsSL "https://grafana.com/api/dashboards/${id}/revisions/${rev}/download" -o "${DIR}/${name}.json" 2>/dev/null; then
    sed -i 's/${DS_PROMETHEUS}/prometheus/g' "${DIR}/${name}.json"
    echo "ok   : ${name}.json (rev ${rev})"
  else
    echo "skip : ${name} (téléchargement indisponible)"
  fi
done
