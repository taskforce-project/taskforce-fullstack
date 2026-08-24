import { afterEach, describe, expect, it } from 'vitest';
import { getAvatarUrl, getInitials } from './avatar';

describe('avatar helper', () => {
  const previousApiUrl = process.env.NEXT_PUBLIC_API_URL;

  afterEach(() => {
    if (previousApiUrl === undefined) {
      delete process.env.NEXT_PUBLIC_API_URL;
      return;
    }

    process.env.NEXT_PUBLIC_API_URL = previousApiUrl;
  });

  it('resolves relative avatar paths against the public API origin', () => {
    process.env.NEXT_PUBLIC_API_URL = 'https://api.taskforce.test/api';

    expect(getAvatarUrl({ email: 'alice@example.com', avatarUrl: '/uploads/avatar.png' }))
      .toBe('https://api.taskforce.test/api/uploads/avatar.png');
  });

  it('keeps absolute avatar URLs unchanged', () => {
    const avatarUrl = 'https://cdn.taskforce.test/avatar.png';

    expect(getAvatarUrl({ email: 'alice@example.com', avatarUrl })).toBe(avatarUrl);
  });

  it('keeps data URLs unchanged', () => {
    const avatarUrl = 'data:image/png;base64,abc123';

    expect(getAvatarUrl({ email: 'alice@example.com', avatarUrl })).toBe(avatarUrl);
  });

  it('generates a local DiceBear data-URI when no avatar exists (no external request)', () => {
    const result = getAvatarUrl({ email: 'alice@example.com', avatarUrl: null });

    // Généré dans le navigateur → jamais d'appel réseau (la CSP prod bloque api.dicebear.com).
    expect(result).toMatch(/^data:image\/svg\+xml/);
    expect(result).not.toContain('api.dicebear.com');
  });

  it('generates a deterministic avatar for the same email', () => {
    const a = getAvatarUrl({ email: 'same@example.com', avatarUrl: null });
    const b = getAvatarUrl({ email: 'same@example.com', avatarUrl: null });

    expect(a).toBe(b);
  });

  it('prefixes a relative path without leading slash and falls back to the default API origin', () => {
    delete process.env.NEXT_PUBLIC_API_URL;

    expect(getAvatarUrl({ email: 'x@example.com', avatarUrl: 'uploads/a.png' }))
      .toBe('http://localhost:8080/uploads/a.png');
  });
});

describe('getInitials', () => {
  it('prefers first/last name initials', () => {
    expect(getInitials({ firstName: 'Jean', lastName: 'Dupont' })).toBe('JD');
  });

  it('handles a single provided name part', () => {
    expect(getInitials({ firstName: 'Jean' })).toBe('J');
  });

  it('derives two initials from a multi-word display name', () => {
    expect(getInitials({ name: 'Marie Claire Martin' })).toBe('MC');
  });

  it('uses the first two letters of a single-word name', () => {
    expect(getInitials({ name: 'Madonna' })).toBe('MA');
  });

  it('splits the local part of an email when no name is given', () => {
    expect(getInitials({ email: 'jean.dupont@example.com' })).toBe('JD');
  });

  it('falls back to "?" when nothing is provided', () => {
    expect(getInitials({})).toBe('?');
    expect(getInitials({ email: null, name: '   ' })).toBe('?');
  });
});
