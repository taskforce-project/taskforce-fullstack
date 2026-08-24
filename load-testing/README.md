# Tests de charge (k6)

## Pourquoi les 83 % d'échec du 1er run

Le run à 50 000 VUs lancé depuis **Windows** a échoué à ~83 % **non pas parce que le serveur tombe**,
mais parce que **Windows épuise ses ports éphémères** (~16 000 par défaut) bien avant 50 000
connexions simultanées → c'est le **client** qui abandonne (`49986 interrupted iterations`).
Le `p(95) = 1,68 s < 3 s` mesuré sur les requêtes abouties est en réalité bon.

Conclusion : relancer depuis **Linux**, avec des limites système élargies, et **décider ce qu'on teste**
(le bouclier Cloudflare, ou l'origine).

## 1. Faire un run fiable (Debian / Ubuntu)

Sur une VM Linux (celle de Quirin, ou une VM dédiée) :

```bash
# Installer k6 (dépôt officiel)
sudo gpg -k
sudo curl -s https://dl.k6.io/key.gpg | sudo gpg --dearmor -o /usr/share/keyrings/k6-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update && sudo apt-get install -y k6
```

Élargir les limites côté client (sinon même souci qu'en Windows) :

```bash
ulimit -n 1048576                                   # descripteurs de fichiers
sudo sysctl -w net.ipv4.ip_local_port_range="1024 65535"
sudo sysctl -w net.ipv4.tcp_tw_reuse=1              # réutilise les sockets TIME_WAIT
```

Lancer :

```bash
BASE_URL=https://app.taskforce-project.fr VUS=1000 k6 run load-test.js
```

## 2. Edge (Cloudflare) vs Origine — ce que tu mesures

| Cible | Ce que ça mesure | 429 Cloudflare ? |
| --- | --- | --- |
| URL publique (`app.` / `api.taskforce-project.fr`) | le **bouclier Cloudflare** (WAF + anti-DDoS) | **Oui, attendu** au-delà d'un seuil — c'est VOULU (le 429 que Pi et Rho a vu). |
| Origine via **Tailscale** (`http://100.122.50.25:<port>`) | la **capacité réelle** du backend / de la VM1 | Non (on court-circuite CF) |

- Pour **valider la protection** anti-abus → tape l'edge, le 429 est une réussite (CF fait son travail).
- Pour **dimensionner la VM** (capacité origine) → depuis une VM sur le **même Tailscale**, vise l'IP
  interne de VM1. C'est LE run utile côté performance pure.

## 3. Cibles réalistes

- 50 000 VUs contre une VM **2 vCPU / 3,8 Go** = surdimensionné : tu mesures surtout la saturation.
  Commence à **500 – 2 000 VUs** en rampe, et regarde **où `http_req_failed` décolle** et **où `p(95)`
  dépasse 3 s**. C'est ça, ta capacité.
- Vise des endpoints **GET publics** (sans auth, sans effet de bord). **Éviter** de marteler
  `/api/auth/login` : rate-limit applicatif + Turnstile + création de charge inutile.
- Paramètres du script : `BASE_URL`, `PATH`, `VUS`, `RAMP_UP`, `STEADY` (voir `load-test.js`).

## 4. Interpréter

- `http_req_failed` : le vrai signal. En dessous de ~1 % hors 429-CF = sain.
- `http_req_duration p(95)` : le seuil du script est 3 s. Au-delà = l'origine sature.
- `iteration_duration` / `interrupted iterations` : s'il y en a beaucoup **sans** que le serveur
  renvoie d'erreurs 5xx, c'est le **client** qui bloque (ports / FD) → relire la section 1.
