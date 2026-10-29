import { describe, it, expect, beforeEach, vi } from 'vitest';
import axios from 'axios';
import { toast } from 'sonner';

/**
 * L'instance renvoyée par `axios.create()` doit être **appelable** : le chemin de rejeu après
 * refresh fait `return apiClient(originalRequest)`. Un objet nu ferait échouer ce cas.
 */
const { mockInstance, mockAxios } = vi.hoisted(() => {
  const instance: any = vi.fn(() => Promise.resolve({ data: 'rejoué' }));
  instance.defaults = {
    baseURL: 'http://localhost:8080',
    headers: { 'Content-Type': 'application/json' },
    timeout: 30000,
    withCredentials: true,
  };
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

// Import après les mocks : c'est cet import qui enregistre les intercepteurs.
const { apiClient, getErrorMessage, AI_TIMEOUT_MS } = await import('./client');

/**
 * Les gestionnaires sont capturés **une fois**, au chargement du module. Les lire ici plutôt que
 * dans un test les met à l'abri du `vi.clearAllMocks()` de `beforeEach`, qui viderait `mock.calls`.
 */
const [onRequest, onRequestError] = mockInstance.interceptors.request.use.mock.calls[0];
const [onResponse, onResponseError] = mockInstance.interceptors.response.use.mock.calls[0];

/** Fabrique une erreur Axios minimale telle que l'intercepteur la reçoit. */
const axiosError = (over: Record<string, unknown> = {}): any => ({
  message: 'boom',
  config: { url: '/api/projects', headers: {} },
  response: undefined,
  ...over,
});

describe('API Client', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // `vitest.setup.ts` installe un localStorage fait de `vi.fn()` nus : `setItem` n'écrit rien et
    // `getItem` renvoie `undefined`. Or tout le comportement testé ici (Bearer, rotation des
    // jetons, purge de session) repose sur un vrai stockage. On lui en donne un, par test.
    const store = new Map<string, string>();
    vi.mocked(localStorage.getItem).mockImplementation((key: string) => store.get(key) ?? null);
    vi.mocked(localStorage.setItem).mockImplementation((key: string, value: string) => {
      store.set(key, String(value));
    });
    vi.mocked(localStorage.removeItem).mockImplementation((key: string) => {
      store.delete(key);
    });
    vi.mocked(localStorage.clear).mockImplementation(() => store.clear());

    Object.defineProperty(window, 'location', {
      value: { href: '' },
      writable: true,
      configurable: true,
    });
  });

  describe('Configuration', () => {
    it('expose une instance Axios configurée', () => {
      expect(apiClient).toBeDefined();
      expect(apiClient.defaults.withCredentials).toBe(true);
    });

    it('expose un timeout dédié aux appels génératifs, au-dessus du défaut', () => {
      // Le LLM local dépasse largement les 30 s par défaut (14B / démarrage à froid).
      expect(AI_TIMEOUT_MS).toBeGreaterThan(apiClient.defaults.timeout as number);
    });
  });

  describe('Intercepteur de requête', () => {
    it('ajoute le Bearer sur un endpoint protégé', () => {
      localStorage.setItem('accessToken', 'tok-123');

      const config = onRequest({ url: '/api/projects', headers: {} });

      expect(config.headers.Authorization).toBe('Bearer tok-123');
    });

    it('n’ajoute rien si aucun token n’est stocké', () => {
      const config = onRequest({ url: '/api/projects', headers: {} });

      expect(config.headers.Authorization).toBeUndefined();
    });

    it('retire le header sur un endpoint public, même si un token traîne', () => {
      // Un token expiré envoyé sur /api/auth/ déclencherait un 401 parasite.
      localStorage.setItem('accessToken', 'tok-expiré');

      const config = onRequest({
        url: '/api/auth/login',
        headers: { Authorization: 'Bearer tok-expiré' },
      });

      expect(config.headers.Authorization).toBeUndefined();
    });

    it('propage une erreur de préparation de requête', async () => {
      const err = new Error('config invalide');
      await expect(onRequestError(err)).rejects.toThrow('config invalide');
    });
  });

  describe('Intercepteur de réponse - succès', () => {
    it('laisse passer la réponse telle quelle', () => {
      const response = { data: { ok: true } };
      expect(onResponse(response)).toBe(response);
    });
  });

  describe('Intercepteur de réponse - 401', () => {
    it('rafraîchit le token puis rejoue la requête', async () => {
      localStorage.setItem('refreshToken', 'refresh-1');
      vi.mocked(axios.post).mockResolvedValue({
        data: { data: { accessToken: 'neuf', refreshToken: 'refresh-2' } },
      } as never);

      const error = axiosError({ response: { status: 401 } });
      const result = await onResponseError(error);

      expect(axios.post).toHaveBeenCalledWith(
        expect.stringContaining('/api/auth/refresh-token'),
        { refreshToken: 'refresh-1' },
        { withCredentials: true },
      );
      expect(localStorage.getItem('accessToken')).toBe('neuf');
      // Le refresh token n'est plus stocké côté JS (cookie HttpOnly) : le legacy est purgé.
      expect(localStorage.getItem('refreshToken')).toBeNull();
      // La requête d'origine repart avec le nouveau jeton.
      expect(error.config.headers.Authorization).toBe('Bearer neuf');
      expect(result).toEqual({ data: 'rejoué' });
    });

    it('accepte une réponse de refresh non enveloppée', async () => {
      localStorage.setItem('refreshToken', 'refresh-1');
      vi.mocked(axios.post).mockResolvedValue({ data: { accessToken: 'nu' } } as never);

      await onResponseError(axiosError({ response: { status: 401 } }));

      expect(localStorage.getItem('accessToken')).toBe('nu');
      // Le refresh token n'est plus stocké côté JS (cookie HttpOnly) : le legacy est purgé.
      expect(localStorage.getItem('refreshToken')).toBeNull();
    });

    it('purge la session et redirige si le refresh échoue', async () => {
      localStorage.setItem('accessToken', 'vieux');
      localStorage.setItem('refreshToken', 'refresh-1');
      localStorage.setItem('user', '{}');
      vi.mocked(axios.post).mockRejectedValue(new Error('refresh refusé'));

      await expect(onResponseError(axiosError({ response: { status: 401 } }))).rejects.toThrow(
        'refresh refusé',
      );

      expect(localStorage.getItem('accessToken')).toBeNull();
      expect(localStorage.getItem('refreshToken')).toBeNull();
      expect(localStorage.getItem('user')).toBeNull();
      expect(window.location.href).toBe('/auth/login');
    });

    it('tente le refresh via cookie et redirige si aucune session', async () => {
      localStorage.setItem('accessToken', 'vieux');
      // Le cookie HttpOnly est invisible au JS : on tente TOUJOURS le refresh ; ici il échoue (pas de session).
      vi.mocked(axios.post).mockRejectedValue(new Error('pas de session'));

      await expect(onResponseError(axiosError({ response: { status: 401 } }))).rejects.toBeDefined();

      expect(axios.post).toHaveBeenCalledWith(
        expect.stringContaining('/api/auth/refresh-token'),
        {},
        { withCredentials: true },
      );
      expect(window.location.href).toBe('/auth/login');
      // Session expirée : aucun toast, la redirection se suffit.
      expect(toast.error).not.toHaveBeenCalled();
    });

    it('laisse un 401 d’endpoint auth au formulaire (mauvais mot de passe)', async () => {
      localStorage.setItem('refreshToken', 'refresh-1');

      await expect(
        onResponseError(
          axiosError({ response: { status: 401 }, config: { url: '/api/auth/login', headers: {} } }),
        ),
      ).rejects.toBeDefined();

      expect(axios.post).not.toHaveBeenCalled();
      expect(window.location.href).toBe('');
      expect(toast.error).not.toHaveBeenCalled();
    });

    it('ne retente qu’une fois', async () => {
      localStorage.setItem('refreshToken', 'refresh-1');

      const error = axiosError({ response: { status: 401 } });
      error.config._retry = true;

      await expect(onResponseError(error)).rejects.toBeDefined();

      expect(axios.post).not.toHaveBeenCalled();
    });
  });

  describe('Intercepteur de réponse - erreurs systémiques', () => {
    it('signale une panne réseau', async () => {
      await expect(onResponseError(axiosError())).rejects.toBeDefined();

      expect(toast.error).toHaveBeenCalledWith(
        "Couldn't reach the server",
        expect.objectContaining({ id: 'api-network-error' }),
      );
    });

    it('reste muet sur une panne réseau lors d’un appel de fond', async () => {
      const error = axiosError({ config: { url: '/api/notifications', silentError: true, headers: {} } });

      await expect(onResponseError(error)).rejects.toBeDefined();

      expect(toast.error).not.toHaveBeenCalled();
    });

    it('signale une erreur serveur 5xx', async () => {
      await expect(
        onResponseError(axiosError({ response: { status: 503, data: { message: 'indisponible' } } })),
      ).rejects.toBeDefined();

      expect(toast.error).toHaveBeenCalledWith(
        'Server error',
        expect.objectContaining({ id: 'api-server-error' }),
      );
    });

    it('reste muet sur un 5xx lors d’un appel de fond', async () => {
      const error = axiosError({
        response: { status: 500 },
        config: { url: '/api/analytics/kpis', silentError: true, headers: {} },
      });

      await expect(onResponseError(error)).rejects.toBeDefined();

      expect(toast.error).not.toHaveBeenCalled();
    });
  });

  describe('Intercepteur de réponse - 429', () => {
    // Retry-After vient du backend (exposé par son CORS) ; une attente courte ou absente reste vague.
    it.each([
      ['42', 'Too many requests, try again in 42 seconds.'],
      ['2', 'Too many requests, try again in a few seconds.'],
      ['pas-un-nombre', 'Too many requests, try again in a few seconds.'],
      [undefined, 'Too many requests, try again in a few seconds.'],
    ])('Retry-After %s : « %s », jamais le toast de panne réseau', async (retryAfter, expected) => {
      const headers = retryAfter === undefined ? {} : { 'retry-after': retryAfter };

      await expect(onResponseError(axiosError({ response: { status: 429, headers } }))).rejects.toBeDefined();

      expect(toast.warning).toHaveBeenCalledWith(expected, expect.objectContaining({ id: 'api-rate-limit' }));
      expect(toast.error).not.toHaveBeenCalled();
    });

    it('montre tel quel le message de la garde IA, qui dit la limite et l’attente', async () => {
      const message = 'This instance allows 1 AI request per minute for each account. Try again in 23 s.';
      const error = axiosError({
        response: { status: 429, headers: { 'retry-after': '23' }, data: { error: 'AI Rate Limited', message } },
      });

      await expect(onResponseError(error)).rejects.toBeDefined();

      expect(toast.warning).toHaveBeenCalledWith(message, expect.objectContaining({ id: 'api-rate-limit' }));
    });

    it('reste muet sur un 429 lors d’un appel de fond', async () => {
      const error = axiosError({
        response: { status: 429, headers: { 'retry-after': '2' } },
        config: { url: '/api/workspaces/acme/notifications', silentError: true, headers: {} },
      });

      await expect(onResponseError(error)).rejects.toBeDefined();

      expect(toast.warning).not.toHaveBeenCalled();
      expect(toast.error).not.toHaveBeenCalled();
    });
  });

  describe('Intercepteur de réponse - 4xx contextuels', () => {
    it('ne produit aucun toast global : l’appelant affiche le message adapté', async () => {
      await expect(
        onResponseError(axiosError({ response: { status: 403, data: { message: 'interdit' } } })),
      ).rejects.toBeDefined();

      expect(toast.error).not.toHaveBeenCalled();
      expect(toast.warning).not.toHaveBeenCalled();
    });
  });

  describe('getErrorMessage', () => {
    it('extrait le message porté par la réponse API', () => {
      vi.mocked(axios.isAxiosError).mockReturnValue(true);

      expect(
        getErrorMessage({ isAxiosError: true, response: { data: { message: 'Custom API error message' } } }),
      ).toBe('Custom API error message');
    });

    it('dit d’un 429 la même chose que le toast global, quel que soit le corps renvoyé', () => {
      vi.mocked(axios.isAxiosError).mockReturnValue(true);

      expect(
        getErrorMessage({
          isAxiosError: true,
          response: {
            status: 429,
            headers: { 'retry-after': '30' },
            data: { message: 'Rate limit reached. Retry in 30s.' },
          },
        }),
      ).toBe('Too many requests, try again in 30 seconds.');
    });

    it('dit d’un 429 de la garde IA son propre message', () => {
      vi.mocked(axios.isAxiosError).mockReturnValue(true);

      expect(
        getErrorMessage({
          isAxiosError: true,
          response: {
            status: 429,
            headers: { 'retry-after': '23' },
            data: { error: 'AI Rate Limited', message: 'Your AI budget for this minute is used. Try again in 23 s.' },
          },
        }),
      ).toBe('Your AI budget for this minute is used. Try again in 23 s.');
    });

    it.each([
      ['une page HTML du relais', '<html>413 Request Entity Too Large</html>', 'This file is too large to upload.'],
      ["le message de l'API", { message: 'This project file is too large.' }, 'This project file is too large.'],
    ])('dit d’un 413 ce que porte %s', (_name, data, expected) => {
      vi.mocked(axios.isAxiosError).mockReturnValue(true);

      expect(
        getErrorMessage({ isAxiosError: true, message: 'Request failed with status code 413', response: { status: 413, data } }),
      ).toBe(expected);
    });

    it('retombe sur error.message quand la réponse ne porte rien', () => {
      vi.mocked(axios.isAxiosError).mockReturnValue(true);

      expect(getErrorMessage({ isAxiosError: true, message: 'Network error', response: undefined })).toBe(
        'Network error',
      );
    });

    it('retombe sur un message générique pour une erreur Axios sans détail', () => {
      vi.mocked(axios.isAxiosError).mockReturnValue(true);

      expect(getErrorMessage({ isAxiosError: true, response: undefined, message: '' })).toBe(
        'Something went wrong',
      );
    });

    it('extrait le message d’une Error standard', () => {
      vi.mocked(axios.isAxiosError).mockReturnValue(false);

      expect(getErrorMessage(new Error('Standard error message'))).toBe('Standard error message');
    });

    it('retombe sur un message générique pour un type inconnu', () => {
      vi.mocked(axios.isAxiosError).mockReturnValue(false);

      expect(getErrorMessage({ unknown: 'error' })).toBe('Something went wrong');
    });

    it('tolère null et undefined', () => {
      vi.mocked(axios.isAxiosError).mockReturnValue(false);

      expect(getErrorMessage(null)).toBe('Something went wrong');
      expect(getErrorMessage(undefined)).toBe('Something went wrong');
    });
  });
});
