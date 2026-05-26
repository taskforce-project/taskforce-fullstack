import { create } from "zustand";
import {
  listLabels,
  createLabel,
  updateLabel,
  deleteLabel,
  type ProjectLabel,
  type CreateLabelPayload,
  type UpdateLabelPayload,
} from "../api/label-service";

interface LabelState {
  /** Labels indexés par projectId */
  labelsByProject: Record<number, ProjectLabel[]>;

  fetchLabels: (slug: string, projectId: number) => Promise<void>;
  addLabel: (slug: string, projectId: number, payload: CreateLabelPayload) => Promise<ProjectLabel>;
  editLabel: (slug: string, projectId: number, labelId: number, payload: UpdateLabelPayload) => Promise<ProjectLabel>;
  removeLabel: (slug: string, projectId: number, labelId: number) => Promise<void>;
}

export const useLabelStore = create<LabelState>((set, get) => ({
  labelsByProject: {},

  fetchLabels: async (slug, projectId) => {
    const labels = await listLabels(slug, projectId);
    set((s) => ({
      labelsByProject: { ...s.labelsByProject, [projectId]: labels },
    }));
  },

  addLabel: async (slug, projectId, payload) => {
    const label = await createLabel(slug, projectId, payload);
    set((s) => ({
      labelsByProject: {
        ...s.labelsByProject,
        [projectId]: [...(s.labelsByProject[projectId] ?? []), label],
      },
    }));
    return label;
  },

  editLabel: async (slug, projectId, labelId, payload) => {
    const updated = await updateLabel(slug, projectId, labelId, payload);
    set((s) => ({
      labelsByProject: {
        ...s.labelsByProject,
        [projectId]: (s.labelsByProject[projectId] ?? []).map((l) =>
          l.id === labelId ? updated : l
        ),
      },
    }));
    return updated;
  },

  removeLabel: async (slug, projectId, labelId) => {
    await deleteLabel(slug, projectId, labelId);
    set((s) => ({
      labelsByProject: {
        ...s.labelsByProject,
        [projectId]: (s.labelsByProject[projectId] ?? []).filter((l) => l.id !== labelId),
      },
    }));
  },
}));
