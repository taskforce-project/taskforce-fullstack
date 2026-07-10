// @ts-check
/**
 * Vendorise les logos de marque depuis l'API SVGL (https://svgl.app) vers `public/logos/`,
 * et génère le manifeste typé `lib/brand-logos.generated.ts`.
 *
 * Pourquoi vendoriser (plutôt que taper l'API au runtime) :
 *  - SVGL recommande de mettre en cache côté client (rate-limit).
 *  - Pas de dépendance réseau externe au runtime (offline / CSP `img-src 'self'`).
 *  - Rendu instantané, aucun layout shift.
 *
 * Lancer :  npm run logos
 * Les clés correspondent aux `key` du catalogue backend (ConnectorCatalog.java).
 */
import { writeFile, mkdir, rm } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const HERE = dirname(fileURLToPath(import.meta.url))
const LOGOS_DIR = join(HERE, "..", "public", "logos")
const MANIFEST = join(HERE, "..", "lib", "brand-logos.generated.ts")
const API = "https://api.svgl.app"

/**
 * key   = clé du connecteur (doit matcher ConnectorCatalog.java)
 * search = terme de recherche SVGL
 * match  = titre SVGL attendu pour lever l'ambiguïté (défaut: search)
 */
const BRANDS = [
  { key: "linear", search: "Linear" },
  { key: "asana", search: "Asana" },
  { key: "clickup", search: "ClickUp" },
  { key: "github", search: "GitHub" },
  { key: "jenkins", search: "Jenkins" },
  { key: "docker", search: "Docker" },
  { key: "kubernetes", search: "Kubernetes" },
  { key: "vercel", search: "Vercel" },
  { key: "render", search: "Render" },
  { key: "cloudflare", search: "Cloudflare" },
  { key: "aws", search: "Amazon", match: "Amazon Web Services" },
  { key: "supabase", search: "Supabase" },
  { key: "neon", search: "Neon" },
  { key: "mongodb-atlas", search: "MongoDB" },
  { key: "redis-cloud", search: "Redis" },
  { key: "google-ads", search: "Google Ads" },
  { key: "meta-ads", search: "Meta", match: "Meta" },
  { key: "linkedin-ads", search: "LinkedIn" },
  { key: "google-analytics", search: "Google Analytics" },
  { key: "posthog", search: "PostHog" },
  { key: "microsoft-clarity", search: "Clarity" },
  { key: "stripe", search: "Stripe" },
  { key: "hubspot", search: "HubSpot" },
  { key: "salesforce", search: "Salesforce" },
  { key: "zoho", search: "Zoho" },
  { key: "intercom", search: "Intercom" },
  { key: "slack", search: "Slack" },
  { key: "twilio", search: "Twilio" },
  { key: "resend", search: "Resend" },
  { key: "clerk", search: "Clerk" },
  { key: "keycloak", search: "Keycloak" },
  { key: "bitwarden", search: "Bitwarden" },
  { key: "notion", search: "Notion" },
  { key: "google-workspace", search: "Google", match: "Google" },
  { key: "microsoft-365", search: "Microsoft", match: "Microsoft" },
  { key: "raycast", search: "Raycast" },
  { key: "canva", search: "Canva" },
  { key: "figma", search: "Figma" },
  { key: "elevenlabs", search: "ElevenLabs" },
  { key: "shopify", search: "Shopify" },
  { key: "n8n", search: "n8n" },
  { key: "zapier", search: "Zapier" },
  { key: "groq", search: "Groq" },
  // Absents de SVGL / pas de marque unique → fallback initiales : plane, vps, mail-smtp, granola,
  // jenkins, zapier, hubspot, intercom, elevenlabs, google-ads, microsoft-clarity, zoho.
]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function fetchJson(url) {
  const res = await fetch(url, { headers: { "User-Agent": "taskforce-logos-script" } })
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`)
  return res.json()
}

async function downloadSvg(url, dest) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`)
  const svg = await res.text()
  if (!svg.trim().startsWith("<svg")) throw new Error(`Réponse non-SVG — ${url}`)
  await writeFile(dest, svg, "utf8")
  return svg
}

/**
 * Un logo « single » 100% blanc ou noir (ex. Notion) disparaît sur un thème (blanc→clair,
 * noir→sombre). On le classe `mono` → rendu via masque CSS + `currentColor` (thème-adaptatif).
 */
function classifyMono(svg) {
  const set = new Set(
    [...svg.matchAll(/#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/g)]
      .map((m) => m[1].toLowerCase())
      .map((h) => (h.length === 3 ? h.split("").map((c) => c + c).join("") : h)),
  )
  if (/[:=]\s*["']?\s*white\b/i.test(svg)) set.add("ffffff")
  if (/[:=]\s*["']?\s*black\b/i.test(svg)) set.add("000000")
  if (set.size !== 1) return "single"
  const only = [...set][0]
  return only === "ffffff" || only === "000000" ? "mono" : "single"
}

/**
 * Choisit le meilleur SVG parmi les résultats — STRICT pour éviter les faux positifs
 * (« Plane » → « PlanetScale »). Ordre : titre exact → résultat unique → mot entier → null.
 * Pas de `list[0]` aveugle : mieux vaut un fallback initiales qu'un mauvais logo.
 */
function pickBest(list, want) {
  const w = want.toLowerCase()
  const t = (s) => (s.title ?? "").toLowerCase()
  const exact = list.find((s) => t(s) === w)
  if (exact) return exact
  if (list.length === 1) return list[0]
  const esc = w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const wholeWord = new RegExp(`(^|[^a-z0-9])${esc}([^a-z0-9]|$)`, "i")
  return list.find((s) => wholeWord.test(t(s))) ?? null
}

async function main() {
  await rm(LOGOS_DIR, { recursive: true, force: true }) // repartir propre (retire les logos périmés)
  await mkdir(LOGOS_DIR, { recursive: true })
  /** @type {Record<string, "single" | "themed">} */
  const manifest = {}
  const missing = []

  for (const b of BRANDS) {
    try {
      const list = await fetchJson(`${API}?search=${encodeURIComponent(b.search)}`)
      if (!Array.isArray(list) || list.length === 0) { missing.push(b.key); console.log(`✗ ${b.key} — aucun résultat`); await sleep(120); continue }
      const svg = pickBest(list, b.match ?? b.search)
      if (!svg) { missing.push(b.key); console.log(`✗ ${b.key} — pas de correspondance fiable`); await sleep(120); continue }
      const route = svg.route

      if (route && typeof route === "object" && route.light && route.dark) {
        await downloadSvg(route.light, join(LOGOS_DIR, `${b.key}-light.svg`))
        await downloadSvg(route.dark, join(LOGOS_DIR, `${b.key}-dark.svg`))
        manifest[b.key] = "themed"
        console.log(`✓ ${b.key} — themed (${svg.title})`)
      } else if (typeof route === "string") {
        const raw = await downloadSvg(route, join(LOGOS_DIR, `${b.key}.svg`))
        const kind = classifyMono(raw)
        manifest[b.key] = kind
        console.log(`✓ ${b.key} — ${kind} (${svg.title})`)
      } else {
        missing.push(b.key); console.log(`✗ ${b.key} — route inattendue`)
      }
    } catch (e) {
      missing.push(b.key)
      console.log(`✗ ${b.key} — ${e.message}`)
    }
    await sleep(120) // politesse rate-limit
  }

  // Manifeste trié (clés alpha) → diff stable
  const ordered = Object.fromEntries(Object.keys(manifest).sort().map((k) => [k, manifest[k]]))
  const ts = `// AUTOGÉNÉRÉ par scripts/fetch-logos.mjs — ne pas éditer à la main.
// Logos de marque (SVGL — https://svgl.app) vendorisés dans public/logos/.
// Régénérer : npm run logos

export type BrandLogoKind = "single" | "themed" | "mono"

export const BRAND_LOGOS: Record<string, BrandLogoKind> = ${JSON.stringify(ordered, null, 2)}
`
  await writeFile(MANIFEST, ts, "utf8")

  console.log(`\n${Object.keys(ordered).length} logos vendorisés → public/logos/`)
  if (missing.length) console.log(`Sans logo (fallback initiales) : ${missing.join(", ")}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
