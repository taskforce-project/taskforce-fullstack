"use client";

import { useEffect, useRef } from "react";

/**
 * Widget Cloudflare Turnstile.
 *
 * <h3>La clé de site vient du serveur, pas de l'environnement du client</h3>
 * Elle est publique par nature — elle est destinée au navigateur — mais elle est servie par
 * `GET /api/auth/challenge` plutôt que dupliquée dans la configuration du frontend. Motif :
 * dupliquée, elle finirait par diverger de celle que le serveur utilise réellement pour vérifier, et
 * la panne serait silencieuse (widget affiché, vérification systématiquement en échec). Une seule
 * source, celle qui décide.
 *
 * <h3>Rendu explicite uniquement — pas de scan implicite</h3>
 * Le script est injecté une seule fois et jamais retiré : Turnstile installe un objet global, et
 * démonter puis remonter le script laisse un état incohérent. Le composant rend le widget lui-même
 * via `turnstile.render()` quand l'API globale est disponible.
 *
 * ⚠️ Le conteneur n'a <b>pas</b> la classe {@code cf-turnstile}. C'est le sélecteur que {@code api.js}
 * scanne au chargement pour rendre automatiquement les widgets (« implicit render »). Avec la classe,
 * Turnstile rendait le widget une première fois (implicite) <b>en plus</b> de notre appel explicite →
 * deux tentatives de rendu dans le même conteneur (« Turnstile skipped implicit render because a
 * widget already exists ») et des {@code postMessage} vers une iframe fantôme. Sans la classe, seul
 * notre rendu explicite s'exécute, et nous restons seuls maîtres du cycle de vie du widget.
 */

/** Surface minimale de l'API globale que Turnstile installe sur `window`. */
interface TurnstileApi {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      action?: string;
      theme?: "light" | "dark" | "auto";
      callback: (token: string) => void;
      "expired-callback"?: () => void;
      "error-callback"?: () => void;
    }
  ) => string;
  remove: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js";
const SCRIPT_ID = "cf-turnstile-script";

interface TurnstileWidgetProps {
  siteKey: string;
  /** Appelé avec le jeton à joindre à l'inscription, ou une chaîne vide quand il expire. */
  onToken: (token: string) => void;
}

export function TurnstileWidget({ siteKey, onToken }: TurnstileWidgetProps) {
  const conteneur = useRef<HTMLDivElement | null>(null);
  const widgetId = useRef<string | null>(null);
  // Gardée dans une référence pour que l'effet de construction ne se relance pas à chaque rendu du
  // parent : le widget ne doit être bâti qu'une fois. La mise à jour se fait dans un effet et non
  // pendant le rendu — écrire dans une `ref` en pleine phase de rendu casse la garantie de pureté et
  // le linter le signale à juste titre (`react-hooks/refs`).
  const rappel = useRef(onToken);
  useEffect(() => {
    rappel.current = onToken;
  }, [onToken]);

  useEffect(() => {
    if (!siteKey) return;

    let annule = false;

    const rendre = () => {
      if (annule || !conteneur.current || !window.turnstile || widgetId.current) return;
      // Repartir d'un conteneur VIDE. En développement, le mode strict de React monte, démonte puis
      // remonte le composant : le démontage appelle `remove()`, mais Turnstile peut laisser un résidu
      // (l'`<input>` de réponse) dans le conteneur. Rendre par-dessus ce résidu produirait un widget
      // sans iframe — présent dans le DOM mais inutilisable. On nettoie donc d'abord.
      conteneur.current.innerHTML = "";
      widgetId.current = window.turnstile.render(conteneur.current, {
        sitekey: siteKey,
        // Marqueur de télémétrie attendu par l'outillage Cloudflare (agrégat par compte, jamais par
        // utilisateur). Le retirer n'empêche rien de fonctionner, on le conserve par exactitude.
        action: "turnstile-spin-v1",
        theme: "auto",
        callback: (token) => rappel.current(token),
        // Un jeton Turnstile est à usage unique et de courte durée : à l'expiration on le vide, pour
        // que le formulaire ne parte pas avec une valeur que le serveur refusera.
        "expired-callback": () => rappel.current(""),
        "error-callback": () => rappel.current(""),
      });
    };

    const existant = document.getElementById(SCRIPT_ID);
    if (window.turnstile) {
      rendre();
    } else if (existant) {
      existant.addEventListener("load", rendre);
    } else {
      const script = document.createElement("script");
      script.id = SCRIPT_ID;
      script.src = SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      script.addEventListener("load", rendre);
      document.head.appendChild(script);
    }

    return () => {
      annule = true;
      if (widgetId.current && window.turnstile) {
        // `remove` peut lever si le widget a déjà été retiré (double démontage du mode strict) : on
        // ignore, l'objectif — plus de widget actif — est de toute façon atteint.
        try {
          window.turnstile.remove(widgetId.current);
        } catch {
          /* déjà retiré */
        }
        widgetId.current = null;
      }
      // Effacer tout résidu laissé par Turnstile, pour que le remontage reparte d'un conteneur propre.
      if (conteneur.current) conteneur.current.innerHTML = "";
    };
  }, [siteKey]);

  // Pas de classe `cf-turnstile` (voir l'en-tête) : elle déclencherait un second rendu implicite.
  // `min-height` réserve la place du widget pour éviter un saut de mise en page pendant son chargement.
  return <div ref={conteneur} style={{ minHeight: 65 }} />;
}
