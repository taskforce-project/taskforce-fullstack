/**
 * Dégradé SVG de l'identité « Labs » - aligné sur le site (palette tirée de l'image du hero Labs :
 * pêche → rose → bleu, **sans violet**). Rendu caché (0×0) une seule fois dans {@code AppShell} pour que
 * les icônes portant la classe {@code tf-labs-icon} ({@code stroke: url(#tf-labs-grad)}) puissent le
 * référencer partout dans l'app (barre latérale, topbar, palette Ctrl+K). Même principe que le
 * {@code LabsGradientDefs.astro} du site : c'est le TRAIT de l'icône qui prend le dégradé, aucun fond.
 */
export function LabsGradientDefs() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="0"
      height="0"
      style={{ position: "absolute", width: 0, height: 0 }}
    >
      <defs>
        <linearGradient id="tf-labs-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffb489" />
          <stop offset="55%" stopColor="#ff6f91" />
          <stop offset="100%" stopColor="#7db8ff" />
        </linearGradient>
      </defs>
    </svg>
  );
}
