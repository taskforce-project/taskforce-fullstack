import { describe, it, expect, beforeEach } from 'vitest';
import { useCreateProjectStore } from './create-project-store';

describe('useCreateProjectStore', () => {
  beforeEach(() => useCreateProjectStore.getState().closeCreateProject());

  it('ouvre le modal sans contexte par défaut', () => {
    useCreateProjectStore.getState().openCreateProject();
    expect(useCreateProjectStore.getState()).toMatchObject({ open: true, importSource: null, repoSetup: false });
  });

  it("retour d'un outil connecté : mode import, source présélectionnée", () => {
    useCreateProjectStore.getState().openCreateProject({ importSource: 'linear' });
    expect(useCreateProjectStore.getState()).toMatchObject({ open: true, importSource: 'linear', repoSetup: false });
  });

  it('retour de GitHub : reprise de la création, section dépôt prête', () => {
    useCreateProjectStore.getState().openCreateProject({ repoSetup: true });
    expect(useCreateProjectStore.getState()).toMatchObject({ open: true, importSource: null, repoSetup: true });
  });

  it('fermer remet tout à zéro (une réouverture normale ne reprend pas un ancien retour OAuth)', () => {
    useCreateProjectStore.getState().openCreateProject({ importSource: 'jira', repoSetup: true });
    useCreateProjectStore.getState().closeCreateProject();
    expect(useCreateProjectStore.getState()).toMatchObject({ open: false, importSource: null, repoSetup: false });
  });
});
