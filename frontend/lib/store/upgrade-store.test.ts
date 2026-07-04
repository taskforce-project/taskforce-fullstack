import { beforeEach, describe, expect, it } from 'vitest';
import { act } from '@testing-library/react';
import { useUpgradeStore } from './upgrade-store';

describe('upgrade-store', () => {
  beforeEach(() => {
    act(() => {
      useUpgradeStore.setState({ open: false });
    });
  });

  it('is closed by default', () => {
    expect(useUpgradeStore.getState().open).toBe(false);
  });

  it('openUpgrade sets open to true', () => {
    act(() => {
      useUpgradeStore.getState().openUpgrade();
    });
    expect(useUpgradeStore.getState().open).toBe(true);
  });

  it('closeUpgrade sets open to false', () => {
    act(() => {
      useUpgradeStore.getState().openUpgrade();
      useUpgradeStore.getState().closeUpgrade();
    });
    expect(useUpgradeStore.getState().open).toBe(false);
  });
});
