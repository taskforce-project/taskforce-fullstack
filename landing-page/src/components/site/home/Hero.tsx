import { Button } from "@/components/ui/button";
import { Placeholder } from "../Placeholder";
import { APP_URL } from "../nav";

/**
 * Hero — titre, promesse, CTA, et un PLACEHOLDER d'écran produit.
 *
 * Décision user : à la place des faux écrans animés, un placeholder, le temps
 * d'avoir de vraies captures. Aucune animation, aucun îlot React à hydrater — la
 * section est entièrement statique.
 */
export function Hero() {
  return (
    <section className="bg-card relative border-b">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[420px]"
        style={{
          background:
            "linear-gradient(to bottom, transparent, color-mix(in oklab, var(--secondary) 70%, transparent))",
        }}
      />

      <div className="container-rail relative pt-20 pb-0 lg:pt-28">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_400px] lg:items-end lg:gap-16">
          <h1 className="t-h1">
            Describe the outcome.
            <br className="hidden sm:block" /> TaskForce runs the delivery.
          </h1>
          <div>
            <p className="t-lead">
              An operating system for shipping work with AI agents. You set the intent, agents plan
              and draft every step, they hand code to Claude or any agent you run — and nothing
              ships without a human approving it.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Button asChild size="pill">
                <a href={`${APP_URL}/auth/register`}>Start for free</a>
              </Button>
              <Button asChild variant="outline" size="pill">
                <a href="/book-a-demo">Book a demo</a>
              </Button>
            </div>
          </div>
        </div>

        {/* L'écran produit descend jusqu'au séparateur de section (comme un vrai
            aperçu qui se fond dans la ligne). */}
        <div className="mt-14">
          <Placeholder label="Product screen" ratio="16 / 8" className="-mb-px rounded-b-none" />
        </div>
      </div>
    </section>
  );
}
