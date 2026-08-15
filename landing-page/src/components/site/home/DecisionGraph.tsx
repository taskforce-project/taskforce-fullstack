/**
 * DecisionGraph — première animation « haut de gamme » custom (phase design, review 14).
 *
 * Remplace le seul placeholder vivant de la page (« Decision graph », section Memory/Synergy).
 * C'est le VISUEL du moat : un graphe CAUSAL — une décision, la contrainte qui l'a produite,
 * l'alternative rejetée, et ce qui en dépend — avec des faisceaux qui parcourent les arêtes.
 *
 * 100 % SVG + SMIL (`animateMotion`) : zéro dépendance, s'anime SANS hydratation (donc statique
 * côté Astro, aucun îlot), couleurs = tokens du site. À itérer visuellement en direct.
 */
export function DecisionGraph() {
  return (
    <div className="bg-card rounded-2xl border p-3 shadow-lg sm:p-4">
      <svg
        viewBox="0 0 480 300"
        className="w-full"
        style={{ fontFamily: "var(--font-sans)" }}
        role="img"
        aria-label="A decision and the graph around it: a requirement drives the choice of Postgres and pgvector, MongoDB is rejected for weaker transactions, and Billing, Search and Users depend on the decision."
      >
        {/* ── Arêtes ── */}
        {/* Requirement → Decision (drives) */}
        <line x1="180" y1="64" x2="180" y2="120" className="stroke-primary/35" strokeWidth={1.5} />
        {/* Decision → Impacts (impacts) */}
        <line x1="180" y1="172" x2="180" y2="232" className="stroke-primary/35" strokeWidth={1.5} />
        {/* Decision → MongoDB (rejected, pointillé) */}
        <line x1="310" y1="146" x2="348" y2="146" className="stroke-border" strokeWidth={1.5} strokeDasharray="4 4" />

        {/* ── Étiquettes d'arêtes (le « pourquoi » sur les liens) ── */}
        <text x="188" y="95" fontSize={9} className="fill-muted-foreground">drives</text>
        <text x="188" y="205" fontSize={9} className="fill-muted-foreground">impacts</text>

        {/* ── Nœud : Requirement ── */}
        <rect x="60" y="20" width="240" height="44" rx="10" className="fill-card stroke-border" />
        <text x="76" y="40" fontSize={12} fontWeight={600} className="fill-foreground">Requirement</text>
        <text x="76" y="55" fontSize={10} className="fill-muted-foreground">Vector search + billing</text>

        {/* ── Nœud : Decision (mis en avant) ── */}
        <rect x="50" y="120" width="260" height="52" rx="12" className="fill-card stroke-primary" strokeWidth={1.5} />
        <rect x="50" y="120" width="260" height="52" rx="12" className="fill-primary/[0.06]" />
        <text x="66" y="140" fontSize={9} fontWeight={600} letterSpacing={0.6} className="fill-primary">DECISION</text>
        <text x="66" y="158" fontSize={13} fontWeight={600} className="fill-foreground">Postgres + pgvector</text>

        {/* ── Nœud : Impacts ── */}
        <rect x="60" y="232" width="240" height="44" rx="10" className="fill-card stroke-border" />
        <text x="76" y="250" fontSize={9} fontWeight={600} letterSpacing={0.6} className="fill-muted-foreground">IMPACTS</text>
        <text x="76" y="266" fontSize={11} className="fill-foreground">Billing · Search · Users</text>

        {/* ── Nœud : rejeté (MongoDB) — porte son propre en-tête REJECTED ── */}
        <rect x="348" y="118" width="120" height="58" rx="10" className="fill-secondary stroke-border" strokeDasharray="4 4" />
        <text x="362" y="134" fontSize={8} fontWeight={600} letterSpacing={0.6} className="fill-muted-foreground">REJECTED</text>
        <text x="362" y="150" fontSize={11} className="fill-foreground">MongoDB</text>
        <text x="362" y="164" fontSize={8.5} className="fill-muted-foreground">Weaker transactions</text>

        {/* ── Faisceaux : la causalité qui « coule » le long de la colonne ── */}
        <circle r="3.5" className="fill-primary">
          <animateMotion path="M 180 64 L 180 120" dur="1.8s" repeatCount="indefinite" />
          <animate
            attributeName="opacity"
            values="0;1;1;0"
            keyTimes="0;0.15;0.85;1"
            dur="1.8s"
            repeatCount="indefinite"
          />
        </circle>
        <circle r="3.5" className="fill-primary">
          <animateMotion path="M 180 172 L 180 232" dur="1.8s" begin="0.9s" repeatCount="indefinite" />
          <animate
            attributeName="opacity"
            values="0;1;1;0"
            keyTimes="0;0.15;0.85;1"
            dur="1.8s"
            begin="0.9s"
            repeatCount="indefinite"
          />
        </circle>
      </svg>
    </div>
  );
}
