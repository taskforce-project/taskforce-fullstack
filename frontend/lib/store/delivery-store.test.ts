import { act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDeliveryStore } from './delivery-store';
import type { DeliveryProvider, DeliveryRun } from '../api/delivery-service';
import * as svc from '../api/delivery-service';

vi.mock('../api/delivery-service', () => ({
  getDeliveryProviders: vi.fn(),
  getIssueRun: vi.fn(),
  delegateIssue: vi.fn(),
  getDeliveryKey: vi.fn(),
  connectDeliveryKey: vi.fn(),
  disconnectDeliveryKey: vi.fn(),
}));

function makeRun(overrides: Partial<DeliveryRun> = {}): DeliveryRun {
  return {
    id: 1, issueId: 5, providerKey: 'stub', model: 'stub', status: 'QUEUED',
    summary: null, resultUrl: null, error: null, startedById: 7, createdAt: null, updatedAt: null,
    ...overrides,
  };
}

const PROVIDERS: DeliveryProvider[] = [
  { key: 'stub', displayName: 'Demo agent (stub)', logoKey: 'sparkles', available: true, models: ['stub'] },
];

describe('delivery-store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    act(() => useDeliveryStore.setState({ providers: [], providersLoading: false, runs: {}, keys: {} }));
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

  it('delegate stores the new run', async () => {
    const run = makeRun({ id: 2, status: 'QUEUED' });
    vi.mocked(svc.delegateIssue).mockResolvedValue(run);
    let res: DeliveryRun | null = null;
    await act(async () => { res = await useDeliveryStore.getState().delegate('acme', 5, 'stub'); });
    expect(res).toEqual(run);
    expect(useDeliveryStore.getState().runs[5]).toEqual(run);
    expect(svc.delegateIssue).toHaveBeenCalledWith('acme', 5, 'stub', undefined);
  });

  it('delegate returns null on failure', async () => {
    vi.mocked(svc.delegateIssue).mockRejectedValue(new Error('x'));
    let res: DeliveryRun | null = makeRun();
    await act(async () => { res = await useDeliveryStore.getState().delegate('acme', 5, 'stub'); });
    expect(res).toBeNull();
  });

  it('fetchKey stores the key status by provider', async () => {
    vi.mocked(svc.getDeliveryKey).mockResolvedValue({ connected: true, keyHint: '...AB12' });
    await act(async () => { await useDeliveryStore.getState().fetchKey('acme', 'anthropic'); });
    expect(useDeliveryStore.getState().keys.anthropic).toEqual({ connected: true, keyHint: '...AB12' });
    expect(svc.getDeliveryKey).toHaveBeenCalledWith('acme', 'anthropic');
  });

  it('fetchKey returns null on failure', async () => {
    vi.mocked(svc.getDeliveryKey).mockRejectedValue(new Error('x'));
    let res: unknown;
    await act(async () => { res = await useDeliveryStore.getState().fetchKey('acme', 'cursor'); });
    expect(res).toBeNull();
  });

  it('connectKey stores the returned status under the provider (cursor)', async () => {
    vi.mocked(svc.connectDeliveryKey).mockResolvedValue({ connected: true, keyHint: '...WXYZ' });
    await act(async () => { await useDeliveryStore.getState().connectKey('acme', 'cursor', 'key_WXYZ'); });
    expect(useDeliveryStore.getState().keys.cursor).toEqual({ connected: true, keyHint: '...WXYZ' });
    expect(svc.connectDeliveryKey).toHaveBeenCalledWith('acme', 'cursor', 'key_WXYZ');
  });

  it('connectKey returns null on failure', async () => {
    vi.mocked(svc.connectDeliveryKey).mockRejectedValue(new Error('x'));
    let res: unknown;
    await act(async () => { res = await useDeliveryStore.getState().connectKey('acme', 'anthropic', 'bad'); });
    expect(res).toBeNull();
  });

  it('disconnectKey clears the provider status and returns true', async () => {
    act(() => useDeliveryStore.setState({ keys: { anthropic: { connected: true, keyHint: '...AB12' } } }));
    vi.mocked(svc.disconnectDeliveryKey).mockResolvedValue(undefined);
    let ok: boolean = false;
    await act(async () => { ok = await useDeliveryStore.getState().disconnectKey('acme', 'anthropic'); });
    expect(ok).toBe(true);
    expect(useDeliveryStore.getState().keys.anthropic).toEqual({ connected: false, keyHint: null });
  });

  it('disconnectKey returns false on failure', async () => {
    vi.mocked(svc.disconnectDeliveryKey).mockRejectedValue(new Error('x'));
    let ok: boolean = true;
    await act(async () => { ok = await useDeliveryStore.getState().disconnectKey('acme', 'cursor'); });
    expect(ok).toBe(false);
  });
});
