import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

// Mock axios before importing apiClient
vi.mock('axios', () => {
  const mockAxios = {
    create: vi.fn(() => ({
      defaults: {
        baseURL: 'http://localhost:8080',
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000,
        withCredentials: true,
      },
      interceptors: {
        request: {
          use: vi.fn(),
          handlers: [{ fulfilled: vi.fn((config) => config), rejected: vi.fn() }],
        },
        response: {
          use: vi.fn(),
          handlers: [{ fulfilled: vi.fn((response) => response), rejected: vi.fn() }],
        },
      },
      post: vi.fn(),
      get: vi.fn(),
    })),
    post: vi.fn(),
    isAxiosError: vi.fn(),
  };
  return { default: mockAxios };
});

// Import after mock
const { apiClient, getErrorMessage } = await import('./client');

describe('API Client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
  });

  describe('apiClient configuration', () => {
    it('should be an axios instance', () => {
      expect(apiClient).toBeDefined();
      expect(apiClient.defaults).toBeDefined();
    });
  });

  describe('Request Interceptor', () => {
    it('should have request interceptors configured', () => {
      expect(apiClient.interceptors).toBeDefined();
      expect(apiClient.interceptors.request).toBeDefined();
    });
  });

  describe('Response Interceptor', () => {
    it('should have response interceptors configured', () => {
      expect(apiClient.interceptors).toBeDefined();
      expect(apiClient.interceptors.response).toBeDefined();
    });
  });

  describe('getErrorMessage', () => {
    it('should extract message from Axios error with API error data', () => {
      const axiosError = {
        isAxiosError: true,
        response: {
          data: {
            message: 'Custom API error message',
            error: 'API_ERROR',
            statusCode: 400,
          },
        },
      } as any;

      vi.spyOn(axios, 'isAxiosError').mockReturnValue(true);

      const message = getErrorMessage(axiosError);
      expect(message).toBe('Custom API error message');
    });

    it('should use error.message when API error data is not available', () => {
      const axiosError = {
        isAxiosError: true,
        message: 'Network error',
        response: undefined,
      } as any;

      vi.spyOn(axios, 'isAxiosError').mockReturnValue(true);

      const message = getErrorMessage(axiosError);
      expect(message).toBe('Network error');
    });

    it('should return default message for Axios error without details', () => {
      const axiosError = {
        isAxiosError: true,
        response: undefined,
        message: '',
      } as any;

      vi.spyOn(axios, 'isAxiosError').mockReturnValue(true);

      const message = getErrorMessage(axiosError);
      expect(message).toBe('Une erreur est survenue');
    });

    it('should extract message from standard Error', () => {
      const error = new Error('Standard error message');

      vi.spyOn(axios, 'isAxiosError').mockReturnValue(false);

      const message = getErrorMessage(error);
      expect(message).toBe('Standard error message');
    });

    it('should return default message for unknown error types', () => {
      const error = { unknown: 'error' };

      vi.spyOn(axios, 'isAxiosError').mockReturnValue(false);

      const message = getErrorMessage(error);
      expect(message).toBe('Une erreur inconnue est survenue');
    });

    it('should handle null or undefined errors', () => {
      vi.spyOn(axios, 'isAxiosError').mockReturnValue(false);

      expect(getErrorMessage(null)).toBe('Une erreur inconnue est survenue');
      expect(getErrorMessage(undefined)).toBe('Une erreur inconnue est survenue');
    });
  });
});
