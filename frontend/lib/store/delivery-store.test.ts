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
  { key: 'claude-code', displayName: 'Claude Code', logoKey: 'anthropic', available: true, models: ['claude-sonnet-5'] },
];

describe('delivery-store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    act(() => useDeliveryStore.setState({ providers: [], providersLoading: false, runs: {}, workspaceRuns: [], runner: null }));
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
});
