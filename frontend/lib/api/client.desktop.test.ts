import { describe, it, expect, beforeEach, vi } from 'vitest';
import axios from 'axios';

/**
 * Client HTTP dans l'app desktop : API sur l'origine de la fenêtre, jeton de lancement de la coque, et pas de
 * renouvellement ni de page de connexion sur un 401. Même montage que `client.test.ts`, module chargé en mode desktop.
 */
const { mockInstance, mockAxios } = vi.hoisted(() => {
  const instance: any = vi.fn(() => Promise.resolve({ data: 'rejoué' }));
  instance.defaults = { headers: {} };
  instance.interceptors = {
    request: { use: vi.fn() },
    response: { use: vi.fn() },
  };
  const axiosMock: any = {
    create: vi.fn(() => instance),
    post: vi.fn(),
    isAxiosError: vi.fn(),
  };
  return { mockInstance: instance, mockAxios: axiosMock };
});

vi.mock('axios', () => ({ default: mockAxios }));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), warning: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

vi.stubEnv('NEXT_PUBLIC_DESKTOP', 'true');
await import('./client');

// Lus une fois au chargement, à l'abri du `vi.clearAllMocks()` de `beforeEach`.
const [createConfig] = mockAxios.create.mock.calls[0];
const [onRequest] = mockInstance.interceptors.request.use.mock.calls[0];
const [, onResponseError] = mockInstance.interceptors.response.use.mock.calls[0];

describe('API client in the desktop app', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (window as Window & { taskforceDesktop?: unknown }).taskforceDesktop = { launchToken: 'tfd_launch' };
    vi.mocked(localStorage.getItem).mockReturnValue('web-token');
    Object.defineProperty(window, 'location', { value: { href: '' }, writable: true, configurable: true });
  });

  it('calls the API on the window origin', () => {
    expect(createConfig).toEqual(expect.objectContaining({ baseURL: '' }));
  });

  it('sends the launch token of the shell', () => {
    const config = onRequest({ url: '/api/projects', headers: {} });

    expect(config.headers.Authorization).toBe('Bearer tfd_launch');
  });

  it('hands a 401 back to the caller, without refresh or sign-in page', async () => {
    const error = { message: 'boom', config: { url: '/api/projects', headers: {} }, response: { status: 401 } };

    await expect(onResponseError(error)).rejects.toBe(error);

    expect(axios.post).not.toHaveBeenCalled();
    expect(mockInstance).not.toHaveBeenCalled();
    expect(window.location.href).toBe('');
  });
});
