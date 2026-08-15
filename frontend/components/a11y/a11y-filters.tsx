/**
 * Filtres SVG du mode daltonien — appliqués à `body` (toute l'app, portails inclus ; cf. `globals.css`),
 * pilotés par `preferences-store.colorblindMode`.
 *
 * <p>Chaque filtre est la <b>daltonisation</b> (correction) précalculée en <b>une seule matrice</b>
 * {@code feColorMatrix} : {@code M = I + Shift·(I − Sim)}, où {@code Sim} est la matrice de simulation
 * dichromatique (réf. Viénot/Brettel) et {@code Shift} la redistribution de l'erreur vers les canaux
 * perçus. La version en chaîne multi-primitives (feComposite) était un no-op à l'exécution (mesuré au
 * pixel) ; une matrice unique produit la même correction ET fonctionne. Effet vérifié : rouge et vert
 * deviennent distinguables ; les couleurs non confondues (ambre/bleu) bougent à peine.</p>
 *
 * <p>Complément — pas un remplacement — du mode « contraste élevé » (tokens sémantiques) et du principe
 * « jamais la couleur seule » (couleur + icône + libellé). Rendu caché (0×0), monté une fois au layout.</p>
 */
export function A11yFilters() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="0"
      height="0"
      style={{ position: "absolute", width: 0, height: 0 }}
    >
      <defs>
        {/* Protanopie (déficience du rouge) */}
        <filter id="cb-protanopia" colorInterpolationFilters="sRGB">
          <feColorMatrix
            type="matrix"
            values="1 0 0 0 0  0.4786 0.4769 0.0445 0 0  0.5976 -0.6891 1.0915 0 0  0 0 0 1 0"
          />
        </filter>

        {/* Deutéranopie (déficience du vert) */}
        <filter id="cb-deuteranopia" colorInterpolationFilters="sRGB">
          <feColorMatrix
            type="matrix"
            values="1 0 0 0 0  0.1631 0.7243 0.1126 0 0  0.4551 -0.6457 1.1906 0 0  0 0 0 1 0"
          />
        </filter>

        {/* Tritanopie (déficience du bleu) */}
        <filter id="cb-tritanopia" colorInterpolationFilters="sRGB">
          <feColorMatrix
            type="matrix"
            values="0.7405 -0.4067 0.6662 0 0  0.0745 0.5853 0.3392 0 0  0 0 1 0 0  0 0 0 1 0"
          />
        </filter>
      </defs>
    </svg>
  );
}
