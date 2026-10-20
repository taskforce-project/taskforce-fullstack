// Relais local pour capturer l'interface desktop hors de l'app : il joue le rôle de la coque (même origine pour
// l'interface et l'API, jeton ajouté aux appels d'API). /api et /ws vont au backend de dev (8080), le reste au serveur
// Next lancé avec NEXT_PUBLIC_DESKTOP=true (5173). Compte de démo du dev : KC_USER, KC_PASS et KC_SECRET viennent de
// l'environnement (valeurs de test du dépôt, voir le README du dossier), jamais d'un fichier.
const http = require("node:http");
const net = require("node:net");

const API = { host: "127.0.0.1", port: 8080 };
const UI = { host: "127.0.0.1", port: 5173 };
const PORT = 5180;
let token = "";

async function refresh() {
  const body = new URLSearchParams({
    client_id: "taskforce-api",
    client_secret: process.env.KC_SECRET,
    grant_type: "password",
    username: process.env.KC_USER,
    password: process.env.KC_PASS,
  }).toString();
  const res = await fetch("http://localhost:8180/realms/taskforce-dev/protocol/openid-connect/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = await res.json();
  token = json.access_token ?? "";
  console.log(new Date().toISOString(), "token", token ? "ok" : "missing");
}

const isApi = (url) => url === "/api" || url.startsWith("/api/") || url.startsWith("/ws");

function headersFor(req, api) {
  const headers = { ...req.headers };
  if (api) {
    headers.host = `localhost:${API.port}`;
    headers.authorization = `Bearer ${token}`;
    if (headers.origin) headers.origin = "http://localhost:5173";
    delete headers.cookie;
  }
  return headers;
}

const server = http.createServer((req, res) => {
  const api = isApi(req.url);
  const target = api ? API : UI;
  const upstream = http.request(
    { host: target.host, port: target.port, path: req.url, method: req.method, headers: headersFor(req, api) },
    (r) => {
      res.writeHead(r.statusCode ?? 502, r.headers);
      r.pipe(res);
    },
  );
  upstream.on("error", (e) => {
    res.writeHead(502);
    res.end(String(e));
  });
  req.pipe(upstream);
});

server.on("upgrade", (req, socket, head) => {
  const api = isApi(req.url);
  const target = api ? API : UI;
  const conn = net.connect(target.port, target.host, () => {
    let head0 = `${req.method} ${req.url} HTTP/1.1\r\n`;
    for (const [k, v] of Object.entries(headersFor(req, api))) head0 += `${k}: ${v}\r\n`;
    conn.write(head0 + "\r\n");
    conn.write(head);
    socket.pipe(conn).pipe(socket);
  });
  conn.on("error", () => socket.destroy());
  socket.on("error", () => conn.destroy());
});

refresh().then(() => {
  setInterval(() => void refresh(), 4 * 60 * 1000);
  server.listen(PORT, "127.0.0.1", () => console.log(`desktop proxy on http://localhost:${PORT}`));
});
