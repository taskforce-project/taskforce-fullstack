import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePreferencesStore } from './preferences-store';

describe('PreferencesStore - Zustand Store', () => {
  beforeEach(() => {
    // Reset store before each test
    const { getState } = usePreferencesStore;
    act(() => {
      getState().setTheme('light');
      getState().setLanguage('fr');
      getState().setReducedMotion(false);
      getState().setFontSize('normal');
      getState().setHighContrast(false);
    });

    // Clear localStorage mock
    localStorage.clear();
    vi.clearAllMocks();
  });

  describe('Theme Management', () => {
    it('should have default theme as light', () => {
      const { result } = renderHook(() => usePreferencesStore());
      expect(result.current.theme).toBe('light');
    });

    it('should update theme when setTheme is called', () => {
      const { result } = renderHook(() => usePreferencesStore());
      
      act(() => {
        result.current.setTheme('dark');
      });

      expect(result.current.theme).toBe('dark');
    });

    it('should toggle theme from light to dark', () => {
      const { result } = renderHook(() => usePreferencesStore());
      
      act(() => {
        result.current.setTheme('light');
      });
      expect(result.current.theme).toBe('light');

      act(() => {
        result.current.toggleTheme();
      });
      expect(result.current.theme).toBe('dark');
    });

    it('should toggle theme from dark to light', () => {
      const { result } = renderHook(() => usePreferencesStore());
      
      act(() => {
        result.current.setTheme('dark');
      });

      act(() => {
        result.current.toggleTheme();
      });
      expect(result.current.theme).toBe('light');
    });
  });

  describe('Language Management', () => {
    it('should have default language as french', () => {
      const { result } = renderHook(() => usePreferencesStore());
      expect(result.current.language).toBe('fr');
    });

    it('should update language when setLanguage is called', () => {
      const { result } = renderHook(() => usePreferencesStore());
      
      act(() => {
        result.current.setLanguage('en');
      });

      expect(result.current.language).toBe('en');
    });

    it('should update translations when language changes', () => {
      const { result } = renderHook(() => usePreferencesStore());
      
      const frTranslations = result.current.t;
      
      act(() => {
        result.current.setLanguage('en');
      });

      const enTranslations = result.current.t;
      
      // Translations should be different objects
      expect(enTranslations).not.toBe(frTranslations);
    });

    it('should provide getTranslations utility function', () => {
      const { result } = renderHook(() => usePreferencesStore());
      
      const translations = result.current.getTranslations();
      expect(translations).toBeDefined();
      expect(typeof translations).toBe('object');
    });
  });

  describe('Accessibility - Reduced Motion', () => {
    it('should have default reducedMotion as false', () => {
      const { result } = renderHook(() => usePreferencesStore());
      expect(result.current.reducedMotion).toBe(false);
    });

    it('should update reducedMotion when setReducedMotion is called', () => {
      const { result } = renderHook(() => usePreferencesStore());
      
      act(() => {
        result.current.setReducedMotion(true);
      });

      expect(result.current.reducedMotion).toBe(true);
    });

    it('should toggle reducedMotion state', () => {
      const { result } = renderHook(() => usePreferencesStore());
      
      act(() => {
        result.current.setReducedMotion(true);
      });
      expect(result.current.reducedMotion).toBe(true);

      act(() => {
        result.current.setReducedMotion(false);
      });
      expect(result.current.reducedMotion).toBe(false);
    });
  });

  describe('Accessibility - Font Size', () => {
    it('should have default fontSize as normal', () => {
      const { result } = renderHook(() => usePreferencesStore());
      expect(result.current.fontSize).toBe('normal');
    });

    it('should update fontSize when setFontSize is called', () => {
      const { result } = renderHook(() => usePreferencesStore());
      
      act(() => {
        result.current.setFontSize('large');
      });

      expect(result.current.fontSize).toBe('large');
    });

    it('should support all font size options', () => {
      const { result } = renderHook(() => usePreferencesStore());
      
      const sizes: Array<'normal' | 'large' | 'x-large'> = ['normal', 'large', 'x-large'];
      
      sizes.forEach((size) => {
        act(() => {
          result.current.setFontSize(size);
        });
        expect(result.current.fontSize).toBe(size);
      });
    });
  });

  describe('Accessibility - High Contrast', () => {
    it('should have default highContrast as false', () => {
      const { result } = renderHook(() => usePreferencesStore());
      expect(result.current.highContrast).toBe(false);
    });

    it('should update highContrast when setHighContrast is called', () => {
      const { result } = renderHook(() => usePreferencesStore());
      
      act(() => {
        result.current.setHighContrast(true);
      });

      expect(result.current.highContrast).toBe(true);
    });

    it('should toggle highContrast state', () => {
      const { result } = renderHook(() => usePreferencesStore());
      
      act(() => {
        result.current.setHighContrast(true);
      });
      expect(result.current.highContrast).toBe(true);

      act(() => {
        result.current.setHighContrast(false);
      });
      expect(result.current.highContrast).toBe(false);
    });
  });

  describe('State Persistence', () => {
    it('should persist state across hook instances', () => {
      const { result: result1 } = renderHook(() => usePreferencesStore());
      
      act(() => {
        result1.current.setTheme('dark');
        result1.current.setLanguage('en');
      });

      const { result: result2 } = renderHook(() => usePreferencesStore());
      
      expect(result2.current.theme).toBe('dark');
      expect(result2.current.language).toBe('en');
    });
  });

  describe('Multiple Settings Update', () => {
    it('should handle multiple updates without conflicts', () => {
      const { result } = renderHook(() => usePreferencesStore());
      
      act(() => {
        result.current.setTheme('dark');
        result.current.setLanguage('en');
        result.current.setFontSize('large');
        result.current.setReducedMotion(true);
        result.current.setHighContrast(true);
      });

      expect(result.current.theme).toBe('dark');
      expect(result.current.language).toBe('en');
      expect(result.current.fontSize).toBe('large');
      expect(result.current.reducedMotion).toBe(true);
      expect(result.current.highContrast).toBe(true);
    });
  });
});
