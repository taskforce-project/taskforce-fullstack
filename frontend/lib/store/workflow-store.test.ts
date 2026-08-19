import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from '@testing-library/react';
import { useWorkflowStore } from './workflow-store';
import * as svc from '@/lib/api/analysis-service';
import type { AnalysisJob, StoredBrief, StoredPriority } from '@/lib/api/analysis-service';

vi.mock('@/lib/api/analysis-service', () => ({
  launchAnalysis: vi.fn(),
  listAnalysisJobs: vi.fn(),
  answerAnalysis: vi.fn(),
  dismissAnalysisJob: vi.fn(),
  getLatestBrief: vi.fn(),
  acceptPriority: vi.fn(),
  pinPriority: vi.fn(),
  dismissPriority: vi.fn(),
  editPriority: vi.fn(),
}));

const job = (id: number, status = 'RUNNING'): AnalysisJob =>
  ({ id, projectId: 1, projectName: 'Web', depth: 'QUICK', status, plan: [], question: null, error: null, briefId: null, createdAt: '2026-07-01T00:00:00.000Z' }) as AnalysisJob;

const priority = (id: number, title = `P${id}`): StoredPriority =>
  ({ id, level: 'HIGH', title, rationale: 'parce que', status: 'PENDING', issueId: null, issueIdentifier: null, position: 0 }) as StoredPriority;

const brief = (priorities: StoredPriority[]): StoredBrief =>
  ({ id: 1, projectId: 1, situation: 'ok', risks: [], snapshot: {}, priorities, mode: 'generated', createdAt: '2026-07-01T00:00:00.000Z' }) as StoredBrief;

const reset = () =>
  act(() => {
    useWorkflowStore.setState({ jobs: [], briefByProject: {}, loadingJobs: false });
  });

describe('workflow-store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    reset();
  });

  describe('fetchJobs', () => {
    it('charge les jobs et retombe le drapeau de chargement', async () => {
      vi.mocked(svc.listAnalysisJobs).mockResolvedValue([job(1)]);

      await act(async () => {
        await useWorkflowStore.getState().fetchJobs('ws');
      });

      expect(svc.listAnalysisJobs).toHaveBeenCalledWith('ws');
      expect(useWorkflowStore.getState().jobs).toHaveLength(1);
      expect(useWorkflowStore.getState().loadingJobs).toBe(false);
    });

    it('un échec est non bloquant : le dock reste sur l’état vide', async () => {
      vi.mocked(svc.listAnalysisJobs).mockRejectedValue(new Error('boom'));

      await act(async () => {
        await useWorkflowStore.getState().fetchJobs('ws');
      });

      expect(useWorkflowStore.getState().jobs).toEqual([]);
      expect(useWorkflowStore.getState().loadingJobs).toBe(false);
    });
  });

  describe('launch', () => {
    it('place le nouveau job en tête sans le dupliquer', async () => {
      act(() => useWorkflowStore.setState({ jobs: [job(1)] }));
      vi.mocked(svc.launchAnalysis).mockResolvedValue(job(2));

      let created: AnalysisJob | null = null;
      await act(async () => {
        created = await useWorkflowStore.getState().launch('ws', 1, 'DEEP');
      });

      expect(svc.launchAnalysis).toHaveBeenCalledWith('ws', 1, 'DEEP');
      expect(created).not.toBeNull();
      expect(useWorkflowStore.getState().jobs.map((j) => j.id)).toEqual([2, 1]);
    });

    it('renvoie null si le lancement échoue', async () => {
      vi.mocked(svc.launchAnalysis).mockRejectedValue(new Error('quota'));

      let created: AnalysisJob | null = job(9);
      await act(async () => {
        created = await useWorkflowStore.getState().launch('ws', 1, 'QUICK');
      });

      expect(created).toBeNull();
      expect(useWorkflowStore.getState().jobs).toEqual([]);
    });
  });

  describe('answer (HITL)', () => {
    it('applique le job renvoyé et confirme', async () => {
      act(() => useWorkflowStore.setState({ jobs: [job(1, 'WAITING_FOR_INPUT')] }));
      vi.mocked(svc.answerAnalysis).mockResolvedValue(job(1, 'RUNNING'));

      let ok = false;
      await act(async () => {
        ok = await useWorkflowStore.getState().answer('ws', 1, 'oui');
      });

      expect(ok).toBe(true);
      expect(useWorkflowStore.getState().jobs[0].status).toBe('RUNNING');
    });

    it('renvoie false si la réponse est refusée', async () => {
      vi.mocked(svc.answerAnalysis).mockRejectedValue(new Error('refus'));

      let ok = true;
      await act(async () => {
        ok = await useWorkflowStore.getState().answer('ws', 1, 'oui');
      });

      expect(ok).toBe(false);
    });
  });

  describe('dismissJob', () => {
    it('retire le job du dock', async () => {
      act(() => useWorkflowStore.setState({ jobs: [job(1), job(2)] }));
      vi.mocked(svc.dismissAnalysisJob).mockResolvedValue(undefined);

      await act(async () => {
        await useWorkflowStore.getState().dismissJob('ws', 1);
      });

      expect(useWorkflowStore.getState().jobs.map((j) => j.id)).toEqual([2]);
    });

    it('laisse le job en place si le serveur refuse', async () => {
      act(() => useWorkflowStore.setState({ jobs: [job(1)] }));
      vi.mocked(svc.dismissAnalysisJob).mockRejectedValue(new Error('refus'));

      await act(async () => {
        await useWorkflowStore.getState().dismissJob('ws', 1);
      });

      expect(useWorkflowStore.getState().jobs).toHaveLength(1);
    });
  });

  describe('applyJobUpdate (temps réel STOMP)', () => {
    it('met à jour un job déjà connu, sans le déplacer', () => {
      act(() => useWorkflowStore.setState({ jobs: [job(1), job(2)] }));

      act(() => useWorkflowStore.getState().applyJobUpdate(job(2, 'DONE')));

      expect(useWorkflowStore.getState().jobs.map((j) => j.id)).toEqual([1, 2]);
      expect(useWorkflowStore.getState().jobs[1].status).toBe('DONE');
    });

    it('insère en tête un job encore inconnu', () => {
      act(() => useWorkflowStore.setState({ jobs: [job(1)] }));

      act(() => useWorkflowStore.getState().applyJobUpdate(job(5)));

      expect(useWorkflowStore.getState().jobs.map((j) => j.id)).toEqual([5, 1]);
    });
  });

  describe('décisions persistées', () => {
    it('fetchBrief range le brief sous son projet', async () => {
      vi.mocked(svc.getLatestBrief).mockResolvedValue(brief([priority(1)]));

      await act(async () => {
        await useWorkflowStore.getState().fetchBrief('ws', 1);
      });

      expect(svc.getLatestBrief).toHaveBeenCalledWith('ws', 1);
      expect(useWorkflowStore.getState().briefByProject[1]?.priorities).toHaveLength(1);
    });

    it('fetchBrief est non bloquant en cas d’échec', async () => {
      vi.mocked(svc.getLatestBrief).mockRejectedValue(new Error('boom'));

      await act(async () => {
        await useWorkflowStore.getState().fetchBrief('ws', 1);
      });

      expect(useWorkflowStore.getState().briefByProject[1]).toBeUndefined();
    });

    it('accept remplace la priorité dans le brief et la renvoie', async () => {
      act(() => useWorkflowStore.setState({ briefByProject: { 1: brief([priority(1, 'avant'), priority(2)]) } }));
      vi.mocked(svc.acceptPriority).mockResolvedValue(priority(1, 'après'));

      let returned: StoredPriority | null = null;
      await act(async () => {
        returned = await useWorkflowStore.getState().accept('ws', 1, 1);
      });

      expect(svc.acceptPriority).toHaveBeenCalledWith('ws', 1);
      expect(returned).not.toBeNull();
      expect(useWorkflowStore.getState().briefByProject[1]?.priorities[0].title).toBe('après');
      // Les autres priorités ne bougent pas.
      expect(useWorkflowStore.getState().briefByProject[1]?.priorities[1].id).toBe(2);
    });

    it('accept renvoie null si le serveur refuse', async () => {
      vi.mocked(svc.acceptPriority).mockRejectedValue(new Error('refus'));

      let returned: StoredPriority | null = priority(9);
      await act(async () => {
        returned = await useWorkflowStore.getState().accept('ws', 1, 1);
      });

      expect(returned).toBeNull();
    });

    it('pin met à jour la priorité ciblée', async () => {
      act(() => useWorkflowStore.setState({ briefByProject: { 1: brief([priority(1, 'avant')]) } }));
      vi.mocked(svc.pinPriority).mockResolvedValue(priority(1, 'épinglée'));

      await act(async () => {
        await useWorkflowStore.getState().pin('ws', 1, 1);
      });

      expect(useWorkflowStore.getState().briefByProject[1]?.priorities[0].title).toBe('épinglée');
    });

    it('dismissPriority met à jour la priorité ciblée', async () => {
      act(() => useWorkflowStore.setState({ briefByProject: { 1: brief([priority(1, 'avant')]) } }));
      vi.mocked(svc.dismissPriority).mockResolvedValue(priority(1, 'écartée'));

      await act(async () => {
        await useWorkflowStore.getState().dismissPriority('ws', 1, 1);
      });

      expect(useWorkflowStore.getState().briefByProject[1]?.priorities[0].title).toBe('écartée');
    });

    it('editPriority met à jour la priorité ciblée', async () => {
      act(() => useWorkflowStore.setState({ briefByProject: { 1: brief([priority(1, 'avant')]) } }));
      vi.mocked(svc.editPriority).mockResolvedValue(priority(1, 'éditée'));

      await act(async () => {
        await useWorkflowStore.getState().editPriority('ws', 1, 1, { title: 'éditée' });
      });

      expect(svc.editPriority).toHaveBeenCalledWith('ws', 1, { title: 'éditée' });
      expect(useWorkflowStore.getState().briefByProject[1]?.priorities[0].title).toBe('éditée');
    });

    it('une mise à jour sur un projet sans brief chargé ne crée rien', async () => {
      vi.mocked(svc.pinPriority).mockResolvedValue(priority(1));

      await act(async () => {
        await useWorkflowStore.getState().pin('ws', 42, 1);
      });

      expect(useWorkflowStore.getState().briefByProject[42]).toBeUndefined();
    });

    it('les erreurs des actions de priorité sont avalées (les toasts sont côté composant)', async () => {
      act(() => useWorkflowStore.setState({ briefByProject: { 1: brief([priority(1, 'avant')]) } }));
      vi.mocked(svc.pinPriority).mockRejectedValue(new Error('refus'));
      vi.mocked(svc.dismissPriority).mockRejectedValue(new Error('refus'));
      vi.mocked(svc.editPriority).mockRejectedValue(new Error('refus'));

      await act(async () => {
        await useWorkflowStore.getState().pin('ws', 1, 1);
        await useWorkflowStore.getState().dismissPriority('ws', 1, 1);
        await useWorkflowStore.getState().editPriority('ws', 1, 1, { title: 'x' });
      });

      expect(useWorkflowStore.getState().briefByProject[1]?.priorities[0].title).toBe('avant');
    });
  });
});
