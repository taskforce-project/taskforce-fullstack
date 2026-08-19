import { beforeEach, describe, expect, it } from 'vitest';
import { act } from '@testing-library/react';
import { useSettingsStore } from './settings-store';

describe('settings-store', () => {
  beforeEach(() => {
    act(() => {
      useSettingsStore.setState({ open: false, section: 'profile' });
    });
  });

  it('démarre fermé sur la section profil', () => {
    expect(useSettingsStore.getState().open).toBe(false);
    expect(useSettingsStore.getState().section).toBe('profile');
  });

  it('openSettings sans argument ouvre le modal sans changer de section', () => {
    act(() => {
      useSettingsStore.setState({ section: 'billing' });
      useSettingsStore.getState().openSettings();
    });

    expect(useSettingsStore.getState().open).toBe(true);
    // Réouvrir depuis un CTA générique ne doit pas ramener l'utilisateur sur « profile ».
    expect(useSettingsStore.getState().section).toBe('billing');
  });

  it('openSettings avec une section ouvre directement dessus (deep-link)', () => {
    act(() => {
      useSettingsStore.getState().openSettings('integrations');
    });

    expect(useSettingsStore.getState().open).toBe(true);
    expect(useSettingsStore.getState().section).toBe('integrations');
  });

  it('closeSettings ferme le modal en conservant la section', () => {
    act(() => {
      useSettingsStore.getState().openSettings('security');
      useSettingsStore.getState().closeSettings();
    });

    expect(useSettingsStore.getState().open).toBe(false);
    // La section est gardée pour rouvrir au même endroit.
    expect(useSettingsStore.getState().section).toBe('security');
  });

  it('setSection change la section sans toucher à l’ouverture', () => {
    act(() => {
      useSettingsStore.getState().setSection('members');
    });

    expect(useSettingsStore.getState().section).toBe('members');
    expect(useSettingsStore.getState().open).toBe(false);
  });
});
