/**
 * L'état d'une mise à jour de l'app, tel que l'interface l'affiche : un toast qui reste, avec l'avancement du
 * téléchargement, puis « Restart now » (demande du CEO, 29/10/2026). Avant, rien ne disait où en était le téléchargement,
 * qui repartait de zéro si l'on quittait l'app en route, puis une boîte de dialogue du système s'ouvrait à la fin.
 *
 * Pur, sans Electron : la coque y fait passer les événements d'`electron-updater`, et diffuse l'état quand il change.
 */
export type UpdateState =
  | { status: "idle" }
  | { status: "downloading"; version: string; percent: number }
  | { status: "ready"; version: string }
  | { status: "failed"; version: string; message: string };

export type UpdateEvent =
  | { kind: "available"; version: string }
  | { kind: "progress"; percent: number }
  | { kind: "downloaded"; version: string }
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
      return state.status === "ready" && state.version === event.version ? null : { status: "ready", version: event.version };
    case "error":
      return state.status === "downloading" ? { status: "failed", version: state.version, message: event.message } : null;
  }
}
