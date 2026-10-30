import { act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDeliveryStore } from './delivery-store';
import type { DeliveryProvider, DeliveryRun } from '../api/delivery-service';
import * as svc from '../api/delivery-service';

vi.mock('../api/delivery-service', () => ({
  getDeliveryProviders: vi.fn(),
  getIssueRun: vi.fn(),
  listWorkspaceRuns: vi.fn(),
  delegateIssue: vi.fn(),
  getRunnerStatus: vi.fn(),
  provisionRunner: vi.fn(),
  getRunActivity: vi.fn(),
  decideApproval: vi.fn(),
  downloadEvidence: vi.fn(),
  applyRun: vi.fn(),
  discardRun: vi.fn(),
  retryRun: vi.fn(),
}));

function makeRun(overrides: Partial<DeliveryRun> = {}): DeliveryRun {
  return {
    id: 1, issueId: 5, issueKey: 'WEB-5', issueTitle: 'Fix the footer', projectId: 12, projectName: 'Website',
    providerKey: 'claude-code', model: 'claude-sonnet-5', status: 'QUEUED',
    summary: null, resultUrl: null, error: null, startedById: 7, createdAt: null, updatedAt: null,
    ...overrides,
  };
}

const PROVIDERS: DeliveryProvider[] = [
  { key: 'claude-code', displayName: 'Claude Code', logoKey: 'anthropic', available: true, models: ['claude-sonnet-5'], ready: true, reason: null },
];

describe('delivery-store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    act(() => useDeliveryStore.setState({ providers: [], projectProviders: {}, providersLoading: false, runs: {}, workspaceRuns: [], runner: null, activity: {} }));
  });

  it('fetchProviders loads the providers', async () => {
    vi.mocked(svc.getDeliveryProviders).mockResolvedValue(PROVIDERS);
    let res: DeliveryProvider[] = [];
    await act(async () => { res = await useDeliveryStore.getState().fetchProviders('acme'); });
    expect(res).toEqual(PROVIDERS);
    expect(useDeliveryStore.getState().providers).toEqual(PROVIDERS);
    expect(useDeliveryStore.getState().providersLoading).toBe(false);
  });

  it('fetchProviders returns [] on failure', async () => {
    vi.mocked(svc.getDeliveryProviders).mockRejectedValue(new Error('x'));
    let res: DeliveryProvider[] = PROVIDERS;
    await act(async () => { res = await useDeliveryStore.getState().fetchProviders('acme'); });
    expect(res).toEqual([]);
    expect(useDeliveryStore.getState().providersLoading).toBe(false);
  });

  it('fetchRun stores the run by issueId', async () => {
    const run = makeRun({ status: 'DONE', summary: 'ok', resultUrl: 'http://x' });
    vi.mocked(svc.getIssueRun).mockResolvedValue(run);
    await act(async () => { await useDeliveryStore.getState().fetchRun('acme', 5); });
    expect(useDeliveryStore.getState().runs[5]).toEqual(run);
  });

  it('fetchRun returns null on failure', async () => {
    vi.mocked(svc.getIssueRun).mockRejectedValue(new Error('x'));
    let res: DeliveryRun | null = makeRun();
    await act(async () => { res = await useDeliveryStore.getState().fetchRun('acme', 5); });
    expect(res).toBeNull();
  });

  it('fetchWorkspaceRuns loads the workspace runs', async () => {
    const runs = [makeRun({ id: 1, issueId: 5 }), makeRun({ id: 2, issueId: 8, status: 'RUNNING' })];
    vi.mocked(svc.listWorkspaceRuns).mockResolvedValue(runs);
    let res: DeliveryRun[] = [];
    await act(async () => { res = await useDeliveryStore.getState().fetchWorkspaceRuns('acme'); });
    expect(res).toEqual(runs);
    expect(useDeliveryStore.getState().workspaceRuns).toEqual(runs);
    expect(svc.listWorkspaceRuns).toHaveBeenCalledWith('acme');
  });

  it('fetchWorkspaceRuns returns [] on failure', async () => {
    vi.mocked(svc.listWorkspaceRuns).mockRejectedValue(new Error('x'));
    let res: DeliveryRun[] = [makeRun()];
    await act(async () => { res = await useDeliveryStore.getState().fetchWorkspaceRuns('acme'); });
    expect(res).toEqual([]);
  });

  it('delegate stores the new run', async () => {
    const run = makeRun({ id: 2, status: 'QUEUED' });
    vi.mocked(svc.delegateIssue).mockResolvedValue(run);
    let res: DeliveryRun | null = null;
    await act(async () => { res = await useDeliveryStore.getState().delegate('acme', 5, 'claude-code'); });
    expect(res).toEqual(run);
    expect(useDeliveryStore.getState().runs[5]).toEqual(run);
    expect(svc.delegateIssue).toHaveBeenCalledWith('acme', 5, 'claude-code', undefined);
  });

  it('delegate returns null on failure', async () => {
    vi.mocked(svc.delegateIssue).mockRejectedValue(new Error('x'));
    let res: DeliveryRun | null = makeRun();
    await act(async () => { res = await useDeliveryStore.getState().delegate('acme', 5, 'claude-code'); });
    expect(res).toBeNull();
  });

  it('fetchRunner stores the runner status', async () => {
    const status = { exists: true, clientId: 'tf-runner-u29', ownerEmail: 'pierre@example.com' };
    vi.mocked(svc.getRunnerStatus).mockResolvedValue(status);
    let res: unknown;
    await act(async () => { res = await useDeliveryStore.getState().fetchRunner(); });
    expect(res).toEqual(status);
    expect(useDeliveryStore.getState().runner).toEqual(status);
  });

  it('fetchRunner returns null on failure', async () => {
    vi.mocked(svc.getRunnerStatus).mockRejectedValue(new Error('x'));
    let res: unknown = 'unset';
    await act(async () => { res = await useDeliveryStore.getState().fetchRunner(); });
    expect(res).toBeNull();
    expect(useDeliveryStore.getState().runner).toBeNull();
  });

  it('provisionRunner returns the credentials but never keeps the secret in the store', async () => {
    const creds = { clientId: 'tf-runner-u29', clientSecret: 's3cr3t', ownerEmail: 'pierre@example.com' };
    vi.mocked(svc.provisionRunner).mockResolvedValue(creds);
    let res: unknown;
    await act(async () => { res = await useDeliveryStore.getState().provisionRunner(); });
    expect(res).toEqual(creds);
    expect(useDeliveryStore.getState().runner).toEqual({ exists: true, clientId: 'tf-runner-u29', ownerEmail: 'pierre@example.com' });
    expect(JSON.stringify(useDeliveryStore.getState())).not.toContain('s3cr3t');
  });

  it('provisionRunner returns null on failure', async () => {
    vi.mocked(svc.provisionRunner).mockRejectedValue(new Error('x'));
    let res: unknown = 'unset';
    await act(async () => { res = await useDeliveryStore.getState().provisionRunner(); });
    expect(res).toBeNull();
  });

  // ---- activité d'un run (lot 5) ----

  const approval = (status: 'PENDING' | 'ALLOWED', canDecide = true) => ({
    id: 9, tool: 'Bash', summary: 'npm install lodash', status, createdAt: null, expiresAt: null, decidedAt: null,
    decidedBy: null, canDecide,
  });
  const event = (seq: number) => ({ seq, kind: 'tool' as const, tool: 'Bash', text: `step ${seq}`, at: null });

  it('fetchActivity reads after the last known event and appends without duplicates', async () => {
    vi.mocked(svc.getRunActivity)
      .mockResolvedValueOnce({ events: [event(1), event(2)], approvals: [approval('PENDING')] })
      .mockResolvedValueOnce({ events: [event(2), event(3)], approvals: [approval('ALLOWED', false)] });

    await act(async () => { await useDeliveryStore.getState().fetchActivity('acme', 100); });
    await act(async () => { await useDeliveryStore.getState().fetchActivity('acme', 100); });

    expect(svc.getRunActivity).toHaveBeenNthCalledWith(1, 'acme', 100, 0);
    expect(svc.getRunActivity).toHaveBeenNthCalledWith(2, 'acme', 100, 2);
    const activity = useDeliveryStore.getState().activity[100];
    expect(activity?.events.map((e) => e.seq)).toEqual([1, 2, 3]);
    expect(activity?.approvals[0]?.status).toBe('ALLOWED');
  });

  it('fetchActivity returns null on failure and keeps what it had', async () => {
    act(() => useDeliveryStore.setState({ activity: { 100: { events: [event(1)], approvals: [] } } }));
    vi.mocked(svc.getRunActivity).mockRejectedValue(new Error('x'));
    let res: unknown = 'unset';
    await act(async () => { res = await useDeliveryStore.getState().fetchActivity('acme', 100); });
    expect(res).toBeNull();
    expect(useDeliveryStore.getState().activity[100]?.events).toHaveLength(1);
  });

  it('decideApproval sends the decision then refreshes the activity', async () => {
    vi.mocked(svc.decideApproval).mockResolvedValue(undefined);
    vi.mocked(svc.getRunActivity).mockResolvedValue({ events: [], approvals: [approval('ALLOWED', false)] });
    let ok = false;
    await act(async () => { ok = await useDeliveryStore.getState().decideApproval('acme', 100, 9, true); });
    expect(ok).toBe(true);
    expect(svc.decideApproval).toHaveBeenCalledWith('acme', 100, 9, true, false);
    expect(useDeliveryStore.getState().activity[100]?.approvals[0]?.status).toBe('ALLOWED');
  });

  it.each([[true, undefined], [false, new Error('404')]] as const)('downloadEvidence -> %s', async (expected, failure) => {
    if (failure) vi.mocked(svc.downloadEvidence).mockRejectedValue(failure);
    else vi.mocked(svc.downloadEvidence).mockResolvedValue(undefined);
    let ok: boolean | null = null;
    await act(async () => { ok = await useDeliveryStore.getState().downloadEvidence('acme', 100, 'md'); });
    expect(ok).toBe(expected);
    expect(svc.downloadEvidence).toHaveBeenCalledWith('acme', 100, 'md');
  });

  it('decideApproval returns false when the server refuses', async () => {
    vi.mocked(svc.decideApproval).mockRejectedValue(new Error('expired'));
    let ok = true;
    await act(async () => { ok = await useDeliveryStore.getState().decideApproval('acme', 100, 9, false); });
    expect(ok).toBe(false);
  });

  // ---- agents par projet (lot 5) ----

  it('fetchProjectProviders keeps the list of each project apart', async () => {
    const notReady = [{ ...PROVIDERS[0]!, ready: false, reason: 'Set up your local runner first' }];
    vi.mocked(svc.getDeliveryProviders).mockResolvedValueOnce(PROVIDERS).mockResolvedValueOnce(notReady);
    await act(async () => { await useDeliveryStore.getState().fetchProjectProviders('acme', 12); });
    await act(async () => { await useDeliveryStore.getState().fetchProjectProviders('acme', 13); });
    expect(svc.getDeliveryProviders).toHaveBeenNthCalledWith(1, 'acme', 12);
    expect(useDeliveryStore.getState().projectProviders[12]?.[0]?.ready).toBe(true);
    expect(useDeliveryStore.getState().projectProviders[13]?.[0]?.reason).toBe('Set up your local runner first');
    expect(useDeliveryStore.getState().providers).toEqual([]);
  });

  it('fetchProjectProviders returns [] on failure', async () => {
    vi.mocked(svc.getDeliveryProviders).mockRejectedValue(new Error('x'));
    let res = PROVIDERS;
    await act(async () => { res = await useDeliveryStore.getState().fetchProjectProviders('acme', 12); });
    expect(res).toEqual([]);
  });
});

describe('delivery-store : les gestes de la carte de résultat (R78)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useDeliveryStore.setState({ runs: {}, resultErrors: {} });
  });

  it('applyRun : appliqué, la mission est relue', async () => {
    vi.mocked(svc.applyRun).mockResolvedValue(undefined);
    vi.mocked(svc.getIssueRun).mockResolvedValue({ id: 100, issueId: 28, status: 'DONE', outcome: 'APPLIED' } as DeliveryRun);

    let ok = false;
    await act(async () => { ok = await useDeliveryStore.getState().applyRun('acme', 28, 100); });

    expect(ok).toBe(true);
    expect(svc.applyRun).toHaveBeenCalledWith('acme', 100);
    expect(useDeliveryStore.getState().runs[28]?.outcome).toBe('APPLIED');
  });

  it.each([
    ['applyRun', (s: ReturnType<typeof useDeliveryStore.getState>) => s.applyRun('acme', 28, 100)],
    ['discardRun', (s: ReturnType<typeof useDeliveryStore.getState>) => s.discardRun('acme', 28, 100)],
  ])('%s refusé : false, et la raison du serveur reste pour la carte', async (name, call) => {
    vi.mocked(name === 'applyRun' ? svc.applyRun : svc.discardRun).mockRejectedValue(new Error('GitHub can\'t merge pull request #212'));

    let ok = true;
    await act(async () => { ok = await call(useDeliveryStore.getState()); });

    expect(ok).toBe(false);
    expect(useDeliveryStore.getState().resultErrors[100]).toMatch(/GitHub can't merge/);
  });

  it('discardRun : écarté, l\'erreur précédente disparaît', async () => {
    useDeliveryStore.setState({ resultErrors: { 100: 'old' } });
    vi.mocked(svc.discardRun).mockResolvedValue(undefined);
    vi.mocked(svc.getIssueRun).mockResolvedValue(null);

    await act(async () => { await useDeliveryStore.getState().discardRun('acme', 28, 100); });

    expect(useDeliveryStore.getState().resultErrors[100]).toBeUndefined();
  });

  it('retryRun : la nouvelle mission remplace l\'ancienne sur l\'issue', async () => {
    vi.mocked(svc.retryRun).mockResolvedValue({ id: 101, issueId: 28, status: 'QUEUED' } as DeliveryRun);

    let next: DeliveryRun | null = null;
    await act(async () => { next = await useDeliveryStore.getState().retryRun('acme', 28, 100, 'Keep the Privacy link'); });

    expect(next).not.toBeNull();
    expect(svc.retryRun).toHaveBeenCalledWith('acme', 100, 'Keep the Privacy link');
    expect(useDeliveryStore.getState().runs[28]?.id).toBe(101);
  });

  it('retryRun refusé : null', async () => {
    vi.mocked(svc.retryRun).mockRejectedValue(new Error('This result was already applied.'));

    let next: DeliveryRun | null = {} as DeliveryRun;
    await act(async () => { next = await useDeliveryStore.getState().retryRun('acme', 28, 100, ''); });

    expect(next).toBeNull();
    expect(useDeliveryStore.getState().resultErrors[100]).toMatch(/already applied/);
  });
});
