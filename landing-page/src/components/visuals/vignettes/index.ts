import type { ComponentType } from "react";

import { AgentsArt, ApproveArt, AssignArt, BranchArt, CommentArt, LiveArt, MergeArt, PrArt, PrCopilotArt } from "./agents";
import { AskArt, ChartArt, ConnectArt, EverydayArt } from "./more";
import { BoardArt, CyclesArt, QueueArt, SubtasksArt, type VProps } from "./plan";

/** Registre des vignettes : les pages Astro les nomment par clé (une fonction ne passe pas en prop d'îlot). */
export const VIGNETTES = {
  board: BoardArt,
  cycles: CyclesArt,
  subtasks: SubtasksArt,
  queue: QueueArt,
  assign: AssignArt,
  branch: BranchArt,
  live: LiveArt,
  agents: AgentsArt,
  approve: ApproveArt,
  pr: PrArt,
  prCopilot: PrCopilotArt,
  comment: CommentArt,
  merge: MergeArt,
  ask: AskArt,
  chart: ChartArt,
  connect: ConnectArt,
  everyday: EverydayArt,
} satisfies Record<string, ComponentType<VProps>>;

export type VignetteKey = keyof typeof VIGNETTES;
export type { VProps };
