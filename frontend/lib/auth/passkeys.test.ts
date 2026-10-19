import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  base64urlToBuffer,
  bufferToBase64url,
  createPasskey,
  creationOptions,
  credentialJson,
  getPasskey,
  passkeyAutofillAvailable,
  passkeyLabel,
  PasskeyError,
  passkeysSupported,
  requestOptions,
} from './passkeys';

const bytes = (...values: number[]) => new Uint8Array(values).buffer;
const asArray = (buffer: unknown) => Array.from(new Uint8Array(buffer as ArrayBuffer));

const credentials = { create: vi.fn(), get: vi.fn() };

function attestation(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cred-1',
    rawId: bytes(1, 2, 3),
    type: 'public-key',
    authenticatorAttachment: 'platform',
    getClientExtensionResults: () => ({ credProps: { rk: true } }),
    response: {
      attestationObject: bytes(4, 5),
      clientDataJSON: bytes(6),
      getTransports: () => ['internal', 'hybrid'],
    },
    ...overrides,
  };
}

function assertion(userHandle: ArrayBuffer | null = bytes(9)) {
  return {
    id: 'cred-1',
    rawId: bytes(1, 2, 3),
    type: 'public-key',
    authenticatorAttachment: null,
    getClientExtensionResults: () => ({}),
    response: { authenticatorData: bytes(7), clientDataJSON: bytes(6), signature: bytes(8), userHandle },
  };
}

class FakePublicKeyCredential {
  static isConditionalMediationAvailable: (() => Promise<boolean>) | undefined = async () => true;
}

beforeEach(() => {
  vi.clearAllMocks();
  FakePublicKeyCredential.isConditionalMediationAvailable = async () => true;
  vi.stubGlobal('PublicKeyCredential', FakePublicKeyCredential);
  vi.stubGlobal('isSecureContext', true);
  Object.defineProperty(navigator, 'credentials', { value: credentials, configurable: true });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('base64url', () => {
  it('reads and writes the URL-safe alphabet without padding', () => {
    const buffer = bytes(0xfb, 0xff, 0x00, 0x10);

    expect(bufferToBase64url(buffer)).toBe('-_8AEA');
    expect(asArray(base64urlToBuffer('-_8AEA'))).toEqual([0xfb, 0xff, 0x00, 0x10]);
  });
});

describe('options from the server', () => {
  it('turns the creation options into what the browser takes, without nulls', () => {
    const options = creationOptions({
      challenge: 'AQI',
      rp: { id: 'localhost', name: 'TaskForce' },
      user: { id: 'Aw', name: 'ada@example.com', displayName: 'Ada' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
      excludeCredentials: [{ id: 'BA', type: 'public-key', transports: ['internal'] }],
      authenticatorSelection: { residentKey: 'required', authenticatorAttachment: null },
      timeout: 300000,
    });

    expect(asArray(options.challenge)).toEqual([1, 2]);
    expect(asArray(options.user.id)).toEqual([3]);
    expect(asArray(options.excludeCredentials?.[0].id)).toEqual([4]);
    expect(options.excludeCredentials?.[0].transports).toEqual(['internal']);
    expect(options.authenticatorSelection).toEqual({ residentKey: 'required' });
    expect(options.rp).toEqual({ id: 'localhost', name: 'TaskForce' });
    expect(options.timeout).toBe(300000);
  });

  it('turns the sign-in options into what the browser takes', () => {
    const options = requestOptions({ challenge: 'AQI', rpId: 'localhost', allowCredentials: [{ id: 'BA', type: 'public-key' }] });

    expect(asArray(options.challenge)).toEqual([1, 2]);
    expect(asArray(options.allowCredentials?.[0].id)).toEqual([4]);
    expect(requestOptions({ challenge: 'AQI', userVerification: 'required' }).allowCredentials).toBeUndefined();
  });
});

describe('answers for the server', () => {
  it('describes a new passkey with the fields the server reads', () => {
    expect(credentialJson(attestation() as unknown as PublicKeyCredential)).toEqual({
      id: 'cred-1',
      rawId: 'AQID',
      type: 'public-key',
      authenticatorAttachment: 'platform',
      clientExtensionResults: { credProps: { rk: true } },
      response: { attestationObject: 'BAU', clientDataJSON: 'Bg', transports: ['internal', 'hybrid'] },
    });
  });

  it('sends no transports when the browser cannot tell them', () => {
    const created = attestation({ response: { attestationObject: bytes(4), clientDataJSON: bytes(6) } });

    expect(credentialJson(created as unknown as PublicKeyCredential).response).toMatchObject({ transports: [] });
  });

  it('describes a signature, with or without the account handle', () => {
    expect(credentialJson(assertion() as unknown as PublicKeyCredential)).toEqual({
      id: 'cred-1',
      rawId: 'AQID',
      type: 'public-key',
      authenticatorAttachment: undefined,
      clientExtensionResults: {},
      response: { authenticatorData: 'Bw', clientDataJSON: 'Bg', signature: 'CA', userHandle: 'CQ' },
    });
    expect(credentialJson(assertion(null) as unknown as PublicKeyCredential).response).toMatchObject({ userHandle: undefined });
  });
});

describe('browser support', () => {
  it('needs WebAuthn on a secure address', () => {
    expect(passkeysSupported()).toBe(true);

    vi.stubGlobal('isSecureContext', false);
    expect(passkeysSupported()).toBe(false);

    vi.stubGlobal('isSecureContext', true);
    vi.stubGlobal('PublicKeyCredential', undefined);
    expect(passkeysSupported()).toBe(false);
  });

  it('suggests passkeys in the email field only when the browser says so', async () => {
    expect(await passkeyAutofillAvailable()).toBe(true);

    FakePublicKeyCredential.isConditionalMediationAvailable = async () => { throw new Error('no'); };
    expect(await passkeyAutofillAvailable()).toBe(false);

    FakePublicKeyCredential.isConditionalMediationAvailable = undefined;
    expect(await passkeyAutofillAvailable()).toBe(false);

    vi.stubGlobal('PublicKeyCredential', undefined);
    expect(await passkeyAutofillAvailable()).toBe(false);
  });
});

describe('createPasskey', () => {
  const options = { challenge: 'AQI', user: { id: 'Aw', name: 'a', displayName: 'a' } };

  it('returns the new passkey for the server', async () => {
    credentials.create.mockResolvedValue(attestation());

    const created = await createPasskey(options);

    expect(created).toMatchObject({ id: 'cred-1', response: { attestationObject: 'BAU' } });
    expect(asArray(credentials.create.mock.calls[0][0].publicKey.challenge)).toEqual([1, 2]);
  });

  it('returns null when the person closes the window or the browser gives nothing', async () => {
    credentials.create.mockRejectedValue(new DOMException('closed', 'NotAllowedError'));
    expect(await createPasskey(options)).toBeNull();

    credentials.create.mockResolvedValue(null);
    expect(await createPasskey(options)).toBeNull();
  });

  it('says when this device already has a passkey for the account', async () => {
    credentials.create.mockRejectedValue(new DOMException('known', 'InvalidStateError'));
    await expect(createPasskey(options)).rejects.toMatchObject({ name: 'PasskeyError', reason: 'exists' });

    credentials.create.mockRejectedValue(new TypeError('bad options'));
    await expect(createPasskey(options)).rejects.toBeInstanceOf(PasskeyError);
  });
});

describe('getPasskey', () => {
  const options = { challenge: 'AQI' };

  it('asks for a passkey, in the email field when conditional', async () => {
    credentials.get.mockResolvedValue(assertion());
    const signal = new AbortController().signal;

    expect(await getPasskey(options)).toMatchObject({ id: 'cred-1', response: { signature: 'CA' } });
    expect(credentials.get.mock.calls[0][0].mediation).toBeUndefined();

    await getPasskey(options, { conditional: true, signal });
    expect(credentials.get.mock.calls[1][0]).toMatchObject({ mediation: 'conditional', signal });
  });

  it('returns null when cancelled or empty, and a PasskeyError otherwise', async () => {
    credentials.get.mockRejectedValue(new DOMException('aborted', 'AbortError'));
    expect(await getPasskey(options)).toBeNull();

    credentials.get.mockResolvedValue(null);
    expect(await getPasskey(options)).toBeNull();

    credentials.get.mockRejectedValue(new DOMException('security', 'SecurityError'));
    await expect(getPasskey(options)).rejects.toMatchObject({ reason: 'failed' });
  });
});

describe('passkeyLabel', () => {
  it.each([
    ['cross-platform', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Security key or phone'],
    ['platform', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Passkey on Windows'],
    ['platform', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'Passkey on Mac'],
    ['platform', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', 'Passkey on iPhone'],
    ['platform', 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)', 'Passkey on iPad'],
    ['platform', 'Mozilla/5.0 (Linux; Android 15; Pixel 9)', 'Passkey on Android'],
    ['platform', 'Mozilla/5.0 (X11; CrOS x86_64 16000.0.0)', 'Passkey on ChromeOS'],
    ['platform', 'Mozilla/5.0 (X11; Linux x86_64)', 'Passkey on Linux'],
    [undefined, 'Mozilla/5.0 (PlayStation)', 'Passkey'],
  ])('%s on %s -> %s', (attachment, userAgent, expected) => {
    expect(passkeyLabel(attachment, userAgent)).toBe(expected);
  });
});
