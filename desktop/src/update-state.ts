/**
 * L'état d'une mise à jour de l'app, tel que l'interface l'affiche : un toast qui reste, avec l'avancement du
 * téléchargement, puis « Restart now » (demande du CEO, 29/10/2026). Avant, rien ne disait où en était le téléchargement,
 * qui repartait de zéro si l'on quittait l'app en route, puis une boîte de dialogue du système s'ouvrait à la fin.
 *
 * Pur, sans Electron : la coque y fait passer les événements d'`electron-updater`, et diffuse l'état quand il change.
 *
 * `retry` : cette version devait déjà s'installer au dernier arrêt, et l'app tourne encore sur la précédente (cf.
 * update-pending.ts). L'installeur tourne sans fenêtre depuis le 05/11/2026 : c'est le toast qui dit l'échec.
 */
export type UpdateState =
  | { status: "idle" }
  | { status: "downloading"; version: string; percent: number }
  | { status: "ready"; version: string; retry?: true }
  | { status: "failed"; version: string; message: string };

export type UpdateEvent =
  | { kind: "available"; version: string }
  | { kind: "progress"; percent: number }
  | { kind: "downloaded"; version: string; retry?: boolean }
  | { kind: "error"; message: string };

export const IDLE: UpdateState = { status: "idle" };

/**
 * L'état suivant, ou `null` quand l'écran n'a rien de neuf à montrer : un pourcentage déjà affiché, ou l'échec d'une
 * simple vérification (hors ligne), qui ne mérite pas un toast. Une version déjà téléchargée le reste.
 */
export function reduceUpdate(state: UpdateState, event: UpdateEvent): UpdateState | null {
  switch (event.kind) {
    case "available":
      if (state.status === "ready" && state.version === event.version) return null;
      if (state.status === "downloading" && state.version === event.version) return null;
      return { status: "downloading", version: event.version, percent: 0 };
    case "progress": {
      if (state.status !== "downloading") return null;
      const percent = Math.min(99, Math.max(0, Math.floor(event.percent)));
      return percent === state.percent ? null : { ...state, percent };
    }
    case "downloaded":
      if (state.status === "ready" && state.version === event.version) return null;
      return event.retry ? { status: "ready", version: event.version, retry: true } : { status: "ready", version: event.version };
    case "error":
      return state.status === "downloading" ? { status: "failed", version: state.version, message: event.message } : null;
  }
}

/**
 * Comment l'app redémarre d'elle-même (déconnexion, session fermée en ligne). Avec une version prête, une simple relance
 * la faisait disparaître : en quittant, electron-updater lance l'installeur en silence, sans `--force-run` ; l'installeur
 * ferme de force tout ce qui tourne depuis le dossier de l'app, l'instance relancée comprise, et ne rouvre rien. Elle
 * redémarre alors par la mise à jour, comme avec « Restart now » : l'installeur la rouvre à la fin. Sans version prête,
 * rien ne s'installe en quittant : une simple relance suffit.
 */
export function restartBy(state: UpdateState): "update" | "relaunch" {
  return state.status === "ready" ? "update" : "relaunch";
}
