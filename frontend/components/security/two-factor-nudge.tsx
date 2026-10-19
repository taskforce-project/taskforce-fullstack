"use client";

import { useEffect } from "react";
import { ShieldCheck } from "lucide-react";

import { useAuth } from "@/lib/contexts/auth-context";
import { getTwoFactorStatus } from "@/lib/api/user-service";
import { notifyRich } from "@/lib/notify";
import { useSettingsStore } from "@/lib/store/settings-store";

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
                  // Le modal Réglages est monté dans l'AppShell, à côté de ce nudge : on l'ouvre en
                  // place. La route `/settings` démontait la page courante et relançait ses chargements.
                  useSettingsStore.getState().openSettings("security");
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
