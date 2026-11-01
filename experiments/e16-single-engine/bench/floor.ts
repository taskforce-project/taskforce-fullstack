/**
 * E16 : le plancher d'un aller-retour HTTP sur 127.0.0.1 dans cette machine, sans Java. Un serveur Node minimal rend
 * une réponse de la taille de celle du backend ; le même client que les bancs (keep-alive, puis connexion neuve).
 * Il sépare ce que coûte la boucle locale de Windows de ce que coûte le backend.
 *
 *   taskforce-runner/node_modules/.bin/tsx experiments/e16-single-engine/bench/floor.ts
 */
import { Agent, createServer } from "node:http";
import type { AddressInfo } from "node:net";

import { machine, postJson, prepareMission, stats, writeResult } from "./common.js";

const answer = JSON.stringify({ success: true, message: "Decision", data: { effect: "ask", rule: "fetch-web", reason: "x".repeat(80), actionClass: "irreversible" } });
const server = createServer((req, res) => {
  req.resume();
  req.on("end", () => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(answer);
  });
});
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
const { calls } = prepareMission();

const keep = new Agent({ keepAlive: true, maxSockets: 1 });
for (let i = 0; i < 2000; i++) await postJson(base, "/", { facts: calls[i % calls.length]?.facts }, {}, keep);
const warm: number[] = [];
for (let i = 0; i < 8600; i++) warm.push((await postJson(base, "/", { facts: calls[i % calls.length]?.facts }, {}, keep)).ms);
const fresh: number[] = [];
for (let i = 0; i < 860; i++) fresh.push((await postJson(base, "/", { facts: calls[i % calls.length]?.facts }, {}, false)).ms);
keep.destroy();
server.close();

const result = { experiment: "E16", label: "floor-node-loopback", machine: machine(), keepAlive: stats(warm), newConnection: stats(fresh) };
console.log(JSON.stringify(result, null, 2));
writeResult("floor-node-loopback", result);
