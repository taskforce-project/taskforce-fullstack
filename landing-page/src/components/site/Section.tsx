import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { MATURITY_LABEL, type Maturity } from "./nav";

/**
 * Primitives de mise en page du site marketing.
 * Ce sont des ASSEMBLAGES (rythme vertical, conteneur, cadre de mock),
 * pas des composants atomiques : tout ce qui est atomique vient de `ui/` (shadcn).
 * Réf. taskforce-docs/v1/14-design/landing-refonte/Plan_Refonte_Site.md §4
 */

/** Badge de maturité - porte l'info par le texte, jamais par la couleur seule (WCAG 1.4.1). */
export function LevelBadge({ level, className }: { level: Maturity; className?: string }) {
  return (
    <Badge
      variant={level}
      className={cn("px-1.5 py-px text-[10px] font-semibold tracking-wide uppercase", className)}
    >
      {MATURITY_LABEL[level]}
    </Badge>
  );
}

/** Bande de section : fond, rythme vertical, conteneur. */
export function Section({
  id,
  band = false,
  className,
  children,
}: {
  id?: string;
  /** Fond gris `--secondary` au lieu du blanc - sert à alterner les sections. */
  band?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className={cn(band ? "bg-secondary" : "bg-card", "border-b", className)}>
      <div className="container-rail py-20 lg:py-28">{children}</div>
    </section>
  );
}

/** En-tête de section : eyebrow + titre + chapô. */
export function SectionHeader({
  eyebrow,
  title,
  lead,
  level,
  index,
  indexHref,
  align = "left",
  className,
}: {
  eyebrow?: string;
  title: ReactNode;
  lead?: ReactNode;
  level?: Maturity;
  /** Numéro de chapitre façon Linear (« 1.0 »), en monospace devant l'eyebrow. */
  index?: string;
  /** Rend l'eyebrow numéroté cliquable, avec une flèche - comme « 1.0 Intake → » chez Linear. */
  indexHref?: string;
  align?: "left" | "center";
  className?: string;
}) {
  return (
    <div className={cn(align === "center" ? "mx-auto max-w-2xl text-center" : "max-w-2xl", className)}>
      {(eyebrow || level || index) && (
        <div
          className={cn(
            "mb-3 flex items-center gap-2.5",
            align === "center" && "justify-center",
          )}
        >
          {index && (
            <span className="text-muted-foreground font-mono text-[12px] tracking-[0.04em] tabular-nums">
              {index}
            </span>
          )}
          {eyebrow &&
            (indexHref ? (
              <a href={indexHref} className="link-underline t-eyebrow inline-flex items-center gap-1">
                {eyebrow}
                <ArrowRight className="size-3.5" />
              </a>
            ) : (
              <span className="t-eyebrow">{eyebrow}</span>
            ))}
          {level && <LevelBadge level={level} />}
        </div>
      )}
      <h2 className="t-h2">{title}</h2>
      {lead && <p className="t-lead mt-4">{lead}</p>}
    </div>
  );
}

/**
 * Cadre de mock produit - la carte blanche qui porte chaque visuel.
 * `chrome` ajoute la barre de fenêtre (pastilles + URL) pour les vues « application ».
 */
export function MockFrame({
  chrome,
  bleed = false,
  className,
  children,
}: {
  chrome?: string;
  /** Descend le cadre jusqu'au séparateur de section : le visuel se fond dans la ligne
   *  du bas au lieu de flotter au milieu du vide. */
  bleed?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <figure
      className={cn(
        "bg-card m-0 overflow-hidden border shadow-lg",
        bleed ? "-mb-px rounded-t-2xl border-b-0" : "rounded-2xl",
        className,
      )}
    >
      {chrome && (
        <div className="bg-secondary/70 flex items-center gap-2 border-b px-4 py-2.5">
          <span className="flex gap-1.5" aria-hidden>
            <span className="size-2.5 rounded-full bg-[#ff5f57]" />
            <span className="size-2.5 rounded-full bg-[#febc2e]" />
            <span className="size-2.5 rounded-full bg-[#28c840]" />
          </span>
          <span className="bg-card text-muted-foreground mx-auto rounded-md border px-3 py-0.5 text-[11px]">
            {chrome}
          </span>
        </div>
      )}
      {children}
    </figure>
  );
}

/**
 * Bloc pleine largeur : en-tête à gauche, visuel **sous** le texte et sur toute la largeur.
 *
 * Sert à casser la monotonie de `FeatureSplit` - une page entière en « texte à gauche,
 * carte à droite » se lit comme un seul bloc et on décroche. Deux `FeatureSplit`
 * consécutifs maximum, puis un `FeatureBand`.
 *
 * `tinted` pose le visuel dans un grand panneau teinté, ce qui change franchement la
 * couleur de la section et sert de respiration visuelle.
 */
export function FeatureBand({
  eyebrow,
  title,
  lead,
  level,
  aside,
  cta,
  tinted = false,
  band = false,
  narrow = false,
  children,
}: {
  eyebrow: string;
  title: ReactNode;
  lead: ReactNode;
  level?: Maturity;
  /** Colonne de droite de l'en-tête : la conséquence, la nuance, la mise en garde. */
  aside?: ReactNode;
  cta?: { label: string; href: string };
  tinted?: boolean;
  band?: boolean;
  /** Borne la largeur du visuel quand il ne gagne rien à s'étirer. */
  narrow?: boolean;
  /** Le visuel. Optionnel : sans lui, la section est en texte seul (pas de placeholder forcé). */
  children?: ReactNode;
}) {
  return (
    <Section band={band}>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)] lg:items-end lg:gap-16">
        <SectionHeader eyebrow={eyebrow} title={title} lead={lead} level={level} />
        {aside && <div className="text-[14px] leading-7 text-foreground">{aside}</div>}
      </div>

      {children && (
        <div
          className={cn(
            "mt-12",
            tinted &&
              "rounded-3xl border p-6 sm:p-10 [background:radial-gradient(120%_100%_at_50%_0%,color-mix(in_oklab,var(--primary)_8%,transparent),transparent_70%)]",
          )}
        >
          <div className={cn(narrow && "mx-auto max-w-3xl")}>{children}</div>
        </div>
      )}

      {cta && (
        <a
          href={cta.href}
          className="link-underline text-primary mt-8 inline-block text-[14px] font-medium"
        >
          {cta.label}
        </a>
      )}
    </Section>
  );
}

/**
 * Bloc « texte + visuel », alterné gauche/droite.
 * C'est le gabarit qui porte l'essentiel de la home et des pages produit.
 */
export function FeatureSplit({
  eyebrow,
  title,
  lead,
  level,
  bullets,
  cta,
  reverse = false,
  band = false,
  children,
}: {
  eyebrow: string;
  title: ReactNode;
  lead: ReactNode;
  level?: Maturity;
  bullets?: string[];
  cta?: { label: string; href: string };
  reverse?: boolean;
  band?: boolean;
  /** Le visuel. Optionnel : sans lui la section passe en une seule colonne de texte. */
  children?: ReactNode;
}) {
  const text = (
    <div className={cn(children && reverse && "lg:order-2")}>
      <SectionHeader eyebrow={eyebrow} title={title} lead={lead} level={level} />
      {bullets && (
        <ul className="mt-8 flex flex-col gap-3">
          {bullets.map((b) => (
            <li key={b} className="flex gap-3 text-[14px] leading-6 text-foreground">
              <span className="bg-primary mt-[9px] size-1.5 shrink-0 rounded-full" aria-hidden />
              {b}
            </li>
          ))}
        </ul>
      )}
      {cta && (
        <a href={cta.href} className="link-underline text-primary mt-8 inline-block text-[14px] font-medium">
          {cta.label}
        </a>
      )}
    </div>
  );

  // Sans visuel : une seule colonne, texte borné en largeur pour rester lisible.
  if (!children) {
    return (
      <Section band={band}>
        <div className="max-w-2xl">{text}</div>
      </Section>
    );
  }

  return (
    <Section band={band}>
      <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
        {text}
        <div className={cn(reverse && "lg:order-1")}>{children}</div>
      </div>
    </Section>
  );
}
