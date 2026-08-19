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

  it('falls back to DiceBear when no avatar exists', () => {
    expect(getAvatarUrl({ email: 'alice@example.com', avatarUrl: null }))
      .toContain('https://api.dicebear.com/9.x/identicon/svg?seed=alice%40example.com');
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
