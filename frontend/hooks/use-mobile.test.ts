import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useIsMobile } from './use-mobile';

describe('useIsMobile', () => {
  let matchMediaSpy: ReturnType<typeof vi.spyOn>;
  let addEventListenerSpy: ReturnType<typeof vi.fn>;
  let removeEventListenerSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    addEventListenerSpy = vi.fn();
    removeEventListenerSpy = vi.fn();

    matchMediaSpy = vi.spyOn(window, 'matchMedia');
    matchMediaSpy.mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: addEventListenerSpy,
      removeEventListener: removeEventListenerSpy,
      dispatchEvent: vi.fn(),
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Initial State', () => {
    it('should return false for desktop viewport (>= 768px)', () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 1024,
      });

      const { result } = renderHook(() => useIsMobile());
      expect(result.current).toBe(false);
    });

    it('should return true for mobile viewport (< 768px)', () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 375,
      });

      const { result } = renderHook(() => useIsMobile());
      expect(result.current).toBe(true);
    });

    it('should return true for exactly 767px (mobile boundary)', () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 767,
      });

      const { result } = renderHook(() => useIsMobile());
      expect(result.current).toBe(true);
    });

    it('should return false for exactly 768px (desktop boundary)', () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 768,
      });

      const { result } = renderHook(() => useIsMobile());
      expect(result.current).toBe(false);
    });
  });

  describe('Media Query Setup', () => {
    it('should create media query with correct breakpoint', () => {
      renderHook(() => useIsMobile());

      expect(matchMediaSpy).toHaveBeenCalledWith('(max-width: 767px)');
    });

    it('should add event listener on mount', () => {
      renderHook(() => useIsMobile());

      expect(addEventListenerSpy).toHaveBeenCalledWith(
        'change',
        expect.any(Function)
      );
    });

    it('should remove event listener on unmount', () => {
      const { unmount } = renderHook(() => useIsMobile());

      unmount();

      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        'change',
        expect.any(Function)
      );
    });
  });

  describe('Responsive Behavior', () => {
    it('should update when viewport changes from desktop to mobile', () => {
      // Start with desktop
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 1024,
      });

      const { result, rerender } = renderHook(() => useIsMobile());
      expect(result.current).toBe(false);

      // Change to mobile
      act(() => {
        Object.defineProperty(window, 'innerWidth', {
          writable: true,
          configurable: true,
          value: 375,
        });

        // Manually trigger the change event
        const changeHandler = addEventListenerSpy.mock.calls[0][1];
        changeHandler();
      });

      expect(result.current).toBe(true);
    });

    it('should update when viewport changes from mobile to desktop', () => {
      // Start with mobile
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 375,
      });

      const { result } = renderHook(() => useIsMobile());
      expect(result.current).toBe(true);

      // Change to desktop
      act(() => {
        Object.defineProperty(window, 'innerWidth', {
          writable: true,
          configurable: true,
          value: 1024,
        });

        const changeHandler = addEventListenerSpy.mock.calls[0][1];
        changeHandler();
      });

      expect(result.current).toBe(false);
    });

    it('should handle multiple viewport changes', () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 1024,
      });

      const { result } = renderHook(() => useIsMobile());
      expect(result.current).toBe(false);

      // First change: desktop -> mobile
      act(() => {
        Object.defineProperty(window, 'innerWidth', {
          value: 375,
        });
        const changeHandler = addEventListenerSpy.mock.calls[0][1];
        changeHandler();
      });
      expect(result.current).toBe(true);

      // Second change: mobile -> desktop
      act(() => {
        Object.defineProperty(window, 'innerWidth', {
          value: 1024,
        });
        const changeHandler = addEventListenerSpy.mock.calls[0][1];
        changeHandler();
      });
      expect(result.current).toBe(false);

      // Third change: desktop -> mobile
      act(() => {
        Object.defineProperty(window, 'innerWidth', {
          value: 600,
        });
        const changeHandler = addEventListenerSpy.mock.calls[0][1];
        changeHandler();
      });
      expect(result.current).toBe(true);
    });
  });

  describe('Common Device Resolutions', () => {
    it.each([
      ['iPhone SE', 375],
      ['iPhone 12 Pro', 390],
      ['iPhone 14 Pro Max', 430],
      ['Samsung Galaxy S21', 360],
      ['iPad Mini', 744],
    ])('should return true for %s (%dpx)', (device, width) => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: width,
      });

      const { result } = renderHook(() => useIsMobile());
      expect(result.current).toBe(true);
    });

    it.each([
      ['iPad Air', 820],
      ['iPad Pro', 1024],
      ['MacBook Air', 1280],
      ['Desktop HD', 1920],
      ['Desktop 4K', 3840],
    ])('should return false for %s (%dpx)', (device, width) => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: width,
      });

      const { result } = renderHook(() => useIsMobile());
      expect(result.current).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should handle very small viewport (< 320px)', () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 240,
      });

      const { result } = renderHook(() => useIsMobile());
      expect(result.current).toBe(true);
    });

    it('should handle very large viewport (> 5000px)', () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 7680,
      });

      const { result } = renderHook(() => useIsMobile());
      expect(result.current).toBe(false);
    });
  });

  describe('Reactivity', () => {
    it('should not cause unnecessary re-renders', () => {
      let renderCount = 0;
      
      const { rerender } = renderHook(() => {
        renderCount++;
        return useIsMobile();
      });

      const initialRenderCount = renderCount;

      // Rerender without changing viewport
      rerender();

      // Should only add 1 more render from the manual rerender
      expect(renderCount).toBe(initialRenderCount + 1);
    });
  });

  describe('SSR/SSG Compatibility', () => {
    it('should handle initial undefined state gracefully', () => {
      // In SSR, window might not be immediately available
      const { result } = renderHook(() => useIsMobile());
      
      // The hook uses !!isMobile, so undefined becomes false
      expect(typeof result.current).toBe('boolean');
    });
  });
});
