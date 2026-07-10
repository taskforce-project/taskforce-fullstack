/**
 * LogosSection — bandeau « works with your stack » (honnête : intégrations, pas de faux clients).
 * Placeholder texte pour l'instant → à remplacer par de vrais logos SVG (SVGL) dans public/logos/.
 */

const TOOLS = ["Claude Code", "Cursor", "GitHub Copilot", "VS Code", "GitHub", "Slack", "Linear"];

export function LogosSection() {
  return (
    <section className="border-y border-black/[0.06] bg-secondary/20 py-10">
      <div className="mx-auto max-w-[1200px] px-6 lg:px-8">
        <p className="text-center text-[13px] font-medium text-muted-foreground">
          Works with the agents and tools you already use
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-10 gap-y-4">
          {TOOLS.map((t) => (
            <span key={t} className="text-[15px] font-semibold tracking-tight text-foreground/35">
              {t}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
