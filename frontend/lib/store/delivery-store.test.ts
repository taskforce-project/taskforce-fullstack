import { act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDeliveryStore } from './delivery-store';
import type { DeliveryProvider, DeliveryRun } from '../api/delivery-service';
import * as svc from '../api/delivery-service';

vi.mock('../api/delivery-service', () => ({
  getDeliveryProviders: vi.fn(),
  getIssueRun: vi.fn(),
  delegateIssue: vi.fn(),
  getAnthropicStatus: vi.fn(),
  connectAnthropicKey: vi.fn(),
  disconnectAnthropicKey: vi.fn(),
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
    act(() => useDeliveryStore.setState({ providers: [], providersLoading: false, runs: {}, anthropic: null }));
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

  it('fetchAnthropic stores the key status', async () => {
    vi.mocked(svc.getAnthropicStatus).mockResolvedValue({ connected: true, keyHint: '...AB12' });
    await act(async () => { await useDeliveryStore.getState().fetchAnthropic('acme'); });
    expect(useDeliveryStore.getState().anthropic).toEqual({ connected: true, keyHint: '...AB12' });
  });

  it('fetchAnthropic returns null on failure', async () => {
    vi.mocked(svc.getAnthropicStatus).mockRejectedValue(new Error('x'));
    let res: unknown;
    await act(async () => { res = await useDeliveryStore.getState().fetchAnthropic('acme'); });
    expect(res).toBeNull();
  });

  it('connectAnthropic stores the returned status', async () => {
    vi.mocked(svc.connectAnthropicKey).mockResolvedValue({ connected: true, keyHint: '...WXYZ' });
    await act(async () => { await useDeliveryStore.getState().connectAnthropic('acme', 'sk-ant-WXYZ'); });
    expect(useDeliveryStore.getState().anthropic).toEqual({ connected: true, keyHint: '...WXYZ' });
    expect(svc.connectAnthropicKey).toHaveBeenCalledWith('acme', 'sk-ant-WXYZ');
  });

  it('connectAnthropic returns null on failure', async () => {
    vi.mocked(svc.connectAnthropicKey).mockRejectedValue(new Error('x'));
    let res: unknown;
    await act(async () => { res = await useDeliveryStore.getState().connectAnthropic('acme', 'bad'); });
    expect(res).toBeNull();
  });

  it('disconnectAnthropic clears the status and returns true', async () => {
    act(() => useDeliveryStore.setState({ anthropic: { connected: true, keyHint: '...AB12' } }));
    vi.mocked(svc.disconnectAnthropicKey).mockResolvedValue(undefined);
    let ok: boolean = false;
    await act(async () => { ok = await useDeliveryStore.getState().disconnectAnthropic('acme'); });
    expect(ok).toBe(true);
    expect(useDeliveryStore.getState().anthropic).toEqual({ connected: false, keyHint: null });
  });

  it('disconnectAnthropic returns false on failure', async () => {
    vi.mocked(svc.disconnectAnthropicKey).mockRejectedValue(new Error('x'));
    let ok: boolean = true;
    await act(async () => { ok = await useDeliveryStore.getState().disconnectAnthropic('acme'); });
    expect(ok).toBe(false);
  });
});
