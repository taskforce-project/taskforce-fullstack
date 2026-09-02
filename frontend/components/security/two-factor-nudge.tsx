"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";

import { useAuth } from "@/lib/contexts/auth-context";
import { getTwoFactorStatus } from "@/lib/api/user-service";
import { notifyRich } from "@/lib/notify";

/**
 * Nudge sécurité : à l'arrivée dans l'app, si le 2FA (TOTP) n'est pas actif, propose de l'activer
 * via une carte riche (« Enable 2FA » → réglages sécurité, ou « Not now » qui n'en reparle plus).
 *
 * <p>Non intrusif : <b>au plus une fois par session</b> (sessionStorage) et jamais rejoué une fois
 * écarté définitivement (localStorage). Best-effort : si le statut 2FA n'est pas joignable, on ne
 * dérange pas. Aucune donnée sensible dans le toast.</p>
 *
 * <p><b>Robustesse (bug corrigé)</b> : pendant l'hydratation, le layout protégé passe par un état de
 * chargement puis monte l'app → ce composant peut se <b>démonter/remonter</b>. Un minuteur lié au
 * cycle de vie était donc annulé au démontage, et le drapeau {@code shown} empêchait de le
 * reprogrammer au remontage → le nudge ne se déclenchait jamais. On utilise donc un garde <b>au niveau
 * module</b> (survit aux remontages) et un minuteur <b>non annulé au démontage</b>.</p>
 */
const DISMISS_KEY = "tf.2fa-nudge.dismissed";
const SESSION_KEY = "tf.2fa-nudge.shown";

// Singleton de module : un seul nudge programmé par chargement de page, insensible aux remontages.
let scheduled = false;

export function TwoFactorNudge() {
  const { isAuthenticated } = useAuth();
  const router = useRouter();
  // Le nudge est monté dans le layout (protected), AU-DESSUS du segment [workspace] : `useParams()`
  // n'y voit pas `workspace`. On dérive donc le slug du 1er segment du chemin (les routes de l'app
  // sont `/{slug}/...`).
  const pathname = usePathname();
  const slug = pathname?.split("/").filter(Boolean)[0] ?? "";

  // Lues au moment du tir, sans faire re-jouer l'effet planificateur. Synchronisées dans un effet
  // (et non pendant le rendu : react-hooks/refs interdit d'écrire une ref au rendu).
  const slugRef = useRef(slug);
  const routerRef = useRef(router);
  useEffect(() => {
    slugRef.current = slug;
    routerRef.current = router;
  });

  useEffect(() => {
    if (!isAuthenticated || scheduled) return;

    try {
      if (localStorage.getItem(DISMISS_KEY) === "1") return; // écarté définitivement
      if (sessionStorage.getItem(SESSION_KEY) === "1") return; // déjà proposé cette session
    } catch {
      /* stockage indisponible : on tentera quand même une fois */
    }
    scheduled = true;
    try {
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      /* ignore */
    }

    // Minuteur VOLONTAIREMENT non annulé au démontage : il doit survivre à un remontage pendant
    // l'hydratation (laisser l'app se poser + ne pas concurrencer l'intro de connexion).
    window.setTimeout(() => {
      getTwoFactorStatus()
        .then((enabled) => {
          if (enabled) return; // déjà protégé → rien à proposer
          notifyRich({
            icon: <ShieldCheck className="size-5" />,
            title: "Secure your account",
            description: "Turn on two-factor authentication for an extra layer of protection.",
            duration: 12000,
            actions: [
              {
                label: "Not now",
                variant: "ghost",
                onClick: (dismiss) => {
                  remember();
                  dismiss();
                },
              },
              {
                label: "Enable 2FA",
                variant: "primary",
                onClick: (dismiss) => {
                  remember();
                  dismiss();
                  const s = slugRef.current;
                  if (s) routerRef.current.push(`/${s}/settings?section=security`);
                },
              },
            ],
          });
        })
        .catch(() => {
          /* statut indisponible : on ne dérange pas */
        });
    }, 3000);
  }, [isAuthenticated]);

  return null;
}

function remember() {
  try {
    localStorage.setItem(DISMISS_KEY, "1");
  } catch {
    /* ignore */
  }
}
