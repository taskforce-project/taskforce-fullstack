import http from "k6/http";
import { check, sleep } from "k6";
import { Rate } from "k6/metrics";

// Test de charge k6 — squelette paramétrable. Voir load-testing/README.md pour le mode opératoire
// (VM Debian, ports éphémères, edge Cloudflare vs origine via Tailscale).
//
// Exemples :
//   BASE_URL=https://app.taskforce-project.fr VUS=1000 k6 run load-test.js   # edge (attend des 429 CF)
//   BASE_URL=http://100.122.50.25:8080 VUS=1000 k6 run load-test.js          # origine VM1 (via Tailscale)

const BASE_URL = __ENV.BASE_URL || "https://app.taskforce-project.fr";
const PATH = __ENV.PATH || "/";
const VUS = Number(__ENV.VUS || 500);

const errors = new Rate("errors");

export const options = {
  scenarios: {
    ramp: {
      executor: "ramping-vus",
      startVUs: 0,
      // Rampe progressive : on NE part PAS à 50 000 VUs d'un coup (c'est ce qui saturait le client).
      // On monte, on tient, on redescend — on regarde où http_req_failed décolle et où p(95) dépasse 3 s.
      stages: [
        { duration: __ENV.RAMP_UP || "1m", target: VUS },
        { duration: __ENV.STEADY || "3m", target: VUS },
        { duration: "30s", target: 0 },
      ],
      gracefulRampDown: "30s",
    },
  },
  thresholds: {
    http_req_duration: ["p(95)<3000"], // 95 % des requêtes sous 3 s
    // < 1 % d'échec. NB : en visant l'EDGE Cloudflare, les 429 (protection anti-DDoS) sont ATTENDUS
    // au-delà d'un seuil — teste plutôt l'origine (Tailscale) pour mesurer la capacité réelle.
    http_req_failed: ["rate<0.01"],
  },
};

export default function () {
  const res = http.get(`${BASE_URL}${PATH}`, { tags: { name: "target" } });

  const ok = check(res, {
    "status est 2xx/3xx": (r) => r.status >= 200 && r.status < 400,
  });
  errors.add(!ok);

  sleep(1); // temps de réflexion : évite un flood irréaliste, rapproche d'un trafic humain
}
