import { beforeEach, describe, expect, it } from 'vitest';
import { act } from '@testing-library/react';
import { usePanelStore } from './panel-store';

describe('panel-store', () => {
  beforeEach(() => {
    act(() => {
      usePanelStore.setState({ panels: [] });
    });
  });

  it('opens a panel with normalized defaults', () => {
    act(() => {
      usePanelStore.getState().openPanel({ id: 'p1', title: 'Panel 1', content: null });
    });

    const panels = usePanelStore.getState().panels;
    expect(panels).toHaveLength(1);
    expect(panels[0]).toMatchObject({
      id: 'p1',
      title: 'Panel 1',
      side: 'right',
      width: 420,
      minWidth: 320,
      maxWidth: 760,
    });
  });

  it('clamps width between min and max on open', () => {
    act(() => {
      usePanelStore.getState().openPanel({ id: 'p1', title: 'P', content: null, width: 9999 });
    });
    expect(usePanelStore.getState().panels[0].width).toBe(760);

    act(() => {
      usePanelStore.getState().openPanel({ id: 'p2', title: 'P', content: null, width: 10 });
    });
    expect(usePanelStore.getState().panels.find((p) => p.id === 'p2')?.width).toBe(320);
  });

  it('re-opening the same id replaces without duplicating and keeps current width', () => {
    act(() => {
      usePanelStore.getState().openPanel({ id: 'p1', title: 'A', content: null });
      usePanelStore.getState().setWidth('p1', 500);
      usePanelStore.getState().openPanel({ id: 'p1', title: 'B', content: null });
    });

    const panels = usePanelStore.getState().panels;
    expect(panels).toHaveLength(1);
    expect(panels[0].title).toBe('B');
    expect(panels[0].width).toBe(500);
  });

  it('togglePanel opens when closed and closes when open', () => {
    const input = { id: 'p1', title: 'P', content: null };
    act(() => {
      usePanelStore.getState().togglePanel(input);
    });
    expect(usePanelStore.getState().isOpen('p1')).toBe(true);

    act(() => {
      usePanelStore.getState().togglePanel(input);
    });
    expect(usePanelStore.getState().isOpen('p1')).toBe(false);
  });

  it('closePanel removes only the target panel', () => {
    act(() => {
      usePanelStore.getState().openPanel({ id: 'p1', title: 'A', content: null });
      usePanelStore.getState().openPanel({ id: 'p2', title: 'B', content: null });
      usePanelStore.getState().closePanel('p1');
    });

    const panels = usePanelStore.getState().panels;
    expect(panels).toHaveLength(1);
    expect(panels[0].id).toBe('p2');
  });

  it('closeAll empties the panels', () => {
    act(() => {
      usePanelStore.getState().openPanel({ id: 'p1', title: 'A', content: null });
      usePanelStore.getState().openPanel({ id: 'p2', title: 'B', content: null });
      usePanelStore.getState().closeAll();
    });
    expect(usePanelStore.getState().panels).toHaveLength(0);
  });

  it('setWidth clamps within the panel bounds', () => {
    act(() => {
      usePanelStore.getState().openPanel({ id: 'p1', title: 'A', content: null, minWidth: 200, maxWidth: 400 });
      usePanelStore.getState().setWidth('p1', 9999);
    });
    expect(usePanelStore.getState().panels[0].width).toBe(400);

    act(() => {
      usePanelStore.getState().setWidth('p1', 1);
    });
    expect(usePanelStore.getState().panels[0].width).toBe(200);
  });

  it('isOpen reflects presence of a panel id', () => {
    expect(usePanelStore.getState().isOpen('p1')).toBe(false);
    act(() => {
      usePanelStore.getState().openPanel({ id: 'p1', title: 'A', content: null });
    });
    expect(usePanelStore.getState().isOpen('p1')).toBe(true);
  });
});
