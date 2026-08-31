import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * Horloge qui se met **réellement en pause** quand l'onglet passe en arrière-plan.
 *
 * `requestAnimationFrame` est suspendu dans un onglet caché - c'est voulu, ça
 * économise le CPU. Mais `performance.now()`, lui, continue d'avancer : au retour
 * de la personne, une scène pilotée par l'horloge brute aurait sauté d'un coup à
 * son état final, sans jamais se jouer.
 *
 * On retranche donc le temps passé caché. Quelqu'un qui ouvre le site dans un
 * onglet d'arrière-plan et y revient trois minutes plus tard voit la scène
 * démarrer normalement, au lieu de la trouver déjà finie.
 */
function useVisibilityClock() {
  const start = useRef(0);
  const hiddenAt = useRef<number | null>(null);

  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) {
        hiddenAt.current = performance.now();
      } else if (hiddenAt.current != null) {
        start.current += performance.now() - hiddenAt.current;
        hiddenAt.current = null;
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  return useMemo(
    () => ({
      reset: () => {
        start.current = performance.now();
        hiddenAt.current = null;
      },
      /** Repositionner la scène à un temps donné - utilisé quand la personne agit. */
      seek: (ms: number) => {
        start.current = performance.now() - ms;
        hiddenAt.current = null;
      },
      /** Temps écoulé hors périodes d'arrière-plan. */
      elapsed: () => (hiddenAt.current ?? performance.now()) - start.current,
    }),
    [],
  );
}

/**
 * useScene - le métronome partagé par toutes les scènes de la home.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'IL CORRIGE
 * ─────────────────────────────────────────────────────────────────────────────
 * Les anciennes illustrations bouclaient toutes en continu, au même tempo. Trois
 * défauts en découlaient :
 *
 *  1. Une boucle n'atterrit jamais. On l'attrape au milieu, on ne sait pas où
 *     l'histoire commence, et l'état final - celui qui porte le message - passe
 *     comme les autres.
 *  2. Un tempo uniforme n'a pas de moment fort. Un « Aha » se fabrique avec un
 *     silence avant, pas avec une étape de plus.
 *  3. Trois cartes qui tournent en même temps, c'est zéro point focal.
 *
 * Ici une scène est une **partition** : une liste de durées. Elle démarre quand
 * elle entre à l'écran, se joue **une fois**, et **se fige sur son état final**.
 * Un temps long dans la partition est un silence : c'est là qu'on regarde.
 *
 * ACCESSIBILITÉ : `prefers-reduced-motion` saute directement à l'état final -
 * la personne voit le message, pas le mouvement (WCAG 2.3.3).
 *
 * ⚠️ L'IntersectionObserver observe un élément que le composant rend lui-même,
 * donc un vrai nœud avec une boîte. Ne jamais l'accrocher à `<astro-island>` :
 * Astro le rend en `display: contents`, sa boîte fait 0 × 0 et l'observer ne se
 * déclenche jamais (c'est ce qui avait gelé toute la page le 24/07).
 */

export type SceneOptions = {
  /**
   * Rejouer la scène ce nombre de ms après l'état final.
   * `null` (défaut) = la scène se fige. C'est le bon choix quand l'état final
   * EST le message ; ne boucler que si la scène raconte un cycle.
   */
  loopAfter?: number | null;
  /** Part visible à partir de laquelle la scène démarre. */
  threshold?: number;
  /**
   * Fige la scène sur ce battement, sans animation. Sert à inspecter un état
   * précis (ex. `?b=15` dans l'URL pour vérifier un moment tardif du film sans
   * attendre qu'il y arrive). `null` = jeu normal.
   */
  fixed?: number | null;
};

export type Scene = {
  /** À poser sur le conteneur racine de la scène. */
  ref: React.RefObject<HTMLDivElement | null>;
  /** Temps courant : 0 = avant le premier battement, `beats.length` = état final. */
  beat: number;
  /** Vrai quand la scène a atterri. */
  done: boolean;
  /** Vrai si l'état final a été imposé pour cause de `prefers-reduced-motion`. */
  reduced: boolean;
  /** Rejouer depuis le début (bouton « Replay » des scènes longues). */
  replay: () => void;
  /**
   * Sauter à un battement - c'est ce qui rend une scène **jouable**.
   * Quand la personne clique `Approve` au lieu d'attendre, la scène ne redémarre
   * pas : elle reprend exactement là où ce clic la mène. Une démo qu'on peut
   * prendre en main se retient bien plus longtemps qu'une démo qu'on regarde.
   */
  goTo: (beat: number) => void;
  /** `true` si le battement `i` est déjà passé - sucre pour la lecture des vues. */
  at: (i: number) => boolean;
};

export function useScene(beats: readonly number[], options: SceneOptions = {}): Scene {
  const { loopAfter = null, threshold = 0.35, fixed = null } = options;

  const ref = useRef<HTMLDivElement>(null);
  const [beat, setBeat] = useState(0);
  const [armed, setArmed] = useState(false);
  const [reduced, setReduced] = useState(false);
  /** Incrémenté par `replay` : c'est ce qui relance la boucle rAF, arrêtée à l'atterrissage. */
  const [runId, setRunId] = useState(0);
  /** Position demandée par `goTo`, consommée au (re)démarrage de la boucle. */
  const seekRef = useRef<number | null>(null);
  const clock = useVisibilityClock();

  // La partition change d'identité à chaque rendu si elle est déclarée en ligne ;
  // on la lit par ref pour ne pas relancer l'effet à chaque frame.
  const beatsRef = useRef(beats);
  beatsRef.current = beats;
  const count = beats.length;

  // Armement : la scène attend d'être vue. Une animation qui se joue hors écran
  // n'est pas une animation, c'est du CPU - et la personne arrive après la fin.
  useEffect(() => {
    // Battement figé (inspection) : on pose l'état et on n'anime rien.
    if (fixed != null) {
      setBeat(fixed);
      return;
    }

    const el = ref.current;
    if (!el) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setReduced(true);
      setBeat(count);
      return;
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setArmed(true);
          io.disconnect();
        }
      },
      { threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [count, threshold, fixed]);

  /**
   * Déroulé, piloté par le TEMPS ÉCOULÉ et non par des `setTimeout` enchaînés.
   *
   * Constaté le 24/07 : un onglet d'arrière-plan voit ses `setTimeout` clampés à
   * 1 s par Chrome. Une chaîne d'incréments fixes se met alors à ramper - la
   * frappe à 18 ms/caractère tombait à 1 caractère/seconde et la scène affichait
   * « Exports ov » longtemps après son atterrissage.
   *
   * En relisant l'horloge à chaque frame, un retard ne décale rien : la frame
   * suivante recalcule la position exacte. `requestAnimationFrame` s'arrête tout
   * seul quand l'onglet passe en arrière-plan (zéro CPU gaspillé), et au retour
   * la scène se replace directement là où elle devrait être.
   */
  useEffect(() => {
    if (fixed != null || !armed || reduced) return;

    let raf = 0;
    // `goTo` a demandé un repositionnement : on reprend là, pas au début.
    if (seekRef.current != null) {
      clock.seek(seekRef.current);
      seekRef.current = null;
    } else {
      clock.reset();
    }
    const total = beatsRef.current.reduce((a, b) => a + b, 0);

    const frame = () => {
      const elapsed = clock.elapsed();

      if (loopAfter != null && elapsed > total + loopAfter) {
        clock.reset();
        setBeat(0);
        raf = requestAnimationFrame(frame);
        return;
      }

      let acc = 0;
      let next = 0;
      for (const d of beatsRef.current) {
        acc += d;
        if (elapsed < acc) break;
        next += 1;
      }
      setBeat((b) => (b === next ? b : next));

      if (next < count || loopAfter != null) raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [armed, reduced, count, loopAfter, runId, clock, fixed]);

  // `setBeat(0)` seul ne suffirait pas : la boucle rAF s'est arrêtée à l'atterrissage.
  const replay = useCallback(() => setRunId((r) => r + 1), []);

  const goTo = useCallback((i: number) => {
    seekRef.current = beatsRef.current.slice(0, i).reduce((a, b) => a + b, 0);
    setBeat(i);
    setArmed(true);
    setRunId((r) => r + 1);
  }, []);

  const at = useCallback((i: number) => beat >= i, [beat]);

  return { ref, beat, done: beat >= count, reduced, replay, goTo, at };
}

/**
 * useTypewriter - du texte qui s'écrit, caractère par caractère.
 *
 * Pourquoi taper plutôt qu'apparaître en fondu : le fondu dit « voici du
 * contenu », la frappe dit « quelque chose est en train de l'écrire ». C'est la
 * seule différence, mais c'est exactement le sens qu'on veut donner.
 *
 * `active` à `false` laisse la chaîne vide ; une fois la frappe terminée le
 * texte reste. Sous `prefers-reduced-motion`, le texte est posé d'un coup.
 */
export function useTypewriter(text: string, active: boolean, msPerChar = 16): string {
  const [n, setN] = useState(0);
  const len = text.length;
  const clock = useVisibilityClock();

  useEffect(() => {
    if (!active) {
      setN(0);
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setN(len);
      return;
    }

    // Même raison que dans `useScene` : on lit l'horloge plutôt que d'enchaîner des
    // `setTimeout` de 18 ms, que le navigateur clampe à 1 s en arrière-plan.
    clock.reset();
    let raf = 0;
    const frame = () => {
      const chars = Math.min(len, Math.floor(clock.elapsed() / msPerChar));
      setN((v) => (v === chars ? v : chars));
      if (chars < len) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [active, len, msPerChar, clock]);

  return text.slice(0, n);
}
