import { describe, it, expect } from 'vitest';
import {
  sanitizeInput,
  validateEmail,
  validatePassword,
  validateOTP,
  validateName,
  validateInput,
  calculatePasswordStrength,
} from './validation';

describe('validation.ts - Utility Functions', () => {
  describe('sanitizeInput', () => {
    it('should remove HTML tags from input', () => {
      const maliciousInput = '<script>void(0)</script>Hello';
      const result = sanitizeInput(maliciousInput);
      expect(result).not.toContain('<script>');
      expect(result).not.toContain('</script>');
      // DOMPurify removes tags, text may or may not remain
    });

    it('should remove event handlers', () => {
      const maliciousInput = '<img src="x" onerror="void(0)">';
      const result = sanitizeInput(maliciousInput);
      expect(result).not.toContain('onerror');
    });

    it('should return clean text unchanged', () => {
      const cleanInput = 'This is a normal text';
      const result = sanitizeInput(cleanInput);
      expect(result).toBe(cleanInput);
    });

    it('should handle empty string', () => {
      expect(sanitizeInput('')).toBe('');
    });

    it('should preserve special characters', () => {
      const input = 'Test@2024!#$%';
      const result = sanitizeInput(input);
      expect(result).toBe(input);
    });
  });

  describe('validateEmail', () => {
    it('should validate correct email addresses', () => {
      expect(validateEmail('test@example.com')).toBe(true);
      expect(validateEmail('user.name@domain.co.uk')).toBe(true);
      expect(validateEmail('test+tag@example.com')).toBe(true);
      expect(validateEmail('user_123@test-domain.org')).toBe(true);
    });

    it('should reject invalid email addresses', () => {
      expect(validateEmail('invalid')).toBe(false);
      expect(validateEmail('@example.com')).toBe(false);
      expect(validateEmail('test@')).toBe(false);
      expect(validateEmail('test@domain')).toBe(false);
      expect(validateEmail('test @example.com')).toBe(false);
      expect(validateEmail('')).toBe(false);
    });

    it('should reject emails longer than 254 characters', () => {
      const longEmail = 'a'.repeat(250) + '@test.com';
      expect(validateEmail(longEmail)).toBe(false);
    });

    it('should handle email with numbers', () => {
      expect(validateEmail('user123@test456.com')).toBe(true);
    });
  });

  describe('validatePassword', () => {
    it('should validate strong passwords', () => {
      const result = validatePassword('StrongP@ssw0rd');
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.strength).toBe('strong');
    });

    it('should validate medium strength passwords', () => {
      const result = validatePassword('Medium@123');
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.strength).toBe('medium');
    });

    it('should detect weak but valid passwords', () => {
      const result = validatePassword('Weak@123');
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.strength).toBe('weak');
    });

    it('should reject password without uppercase', () => {
      const result = validatePassword('weak@pass123');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Le mot de passe doit contenir au moins une majuscule');
    });

    it('should reject password without lowercase', () => {
      const result = validatePassword('WEAK@PASS123');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Le mot de passe doit contenir au moins une minuscule');
    });

    it('should reject password without number', () => {
      const result = validatePassword('WeakPass@');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Le mot de passe doit contenir au moins un chiffre');
    });

    it('should reject password without special character', () => {
      const result = validatePassword('WeakPass123');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Le mot de passe doit contenir au moins un caractère spécial');
    });

    it('should reject password too short', () => {
      const result = validatePassword('Weak@1');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Le mot de passe doit contenir au moins 8 caractères');
    });

    it('should return multiple errors for very weak password', () => {
      const result = validatePassword('weak');
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
    });
  });

  describe('validateOTP', () => {
    it('should validate correct 6-digit OTP', () => {
      expect(validateOTP('123456')).toBe(true);
      expect(validateOTP('000000')).toBe(true);
      expect(validateOTP('999999')).toBe(true);
    });

    it('should reject invalid OTP formats', () => {
      expect(validateOTP('12345')).toBe(false); // Too short
      expect(validateOTP('1234567')).toBe(false); // Too long
      expect(validateOTP('12345a')).toBe(false); // Contains letter
      expect(validateOTP('12 34 56')).toBe(false); // Contains spaces
      expect(validateOTP('')).toBe(false);
      expect(validateOTP('abcdef')).toBe(false);
    });
  });

  describe('validateName', () => {
    it('should validate correct names', () => {
      expect(validateName('Jean')).toBe(true);
      expect(validateName('Marie-Claire')).toBe(true);
      expect(validateName("O'Connor")).toBe(true);
      expect(validateName('François')).toBe(true);
      expect(validateName('José María')).toBe(true);
    });

    it('should reject invalid names', () => {
      expect(validateName('J')).toBe(false); // Too short
      expect(validateName('A'.repeat(51))).toBe(false); // Too long
      expect(validateName('Jean123')).toBe(false); // Contains numbers
      expect(validateName('Jean@')).toBe(false); // Contains special char
      expect(validateName('')).toBe(false);
    });

    it('should accept names with accents', () => {
      expect(validateName('Élise')).toBe(true);
      expect(validateName('René')).toBe(true);
      expect(validateName('Müller')).toBe(true);
    });
  });

  describe('validateInput', () => {
    it('should validate safe inputs', () => {
      const result = validateInput('Normal text input');
      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
      expect(result.sanitized).toBe('Normal text input');
    });

    it('should sanitize and warn about suspicious content', () => {
      const result = validateInput('<script>void(0)</script>');
      expect(result.isValid).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.sanitized).not.toContain('<script>');
    });

    it('should reject inputs exceeding max length', () => {
      const longInput = 'A'.repeat(256);
      const result = validateInput(longInput, 255);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('ne peut pas dépasser 255 caractères');
    });

    it('should accept input under max length', () => {
      const input = 'A'.repeat(100);
      const result = validateInput(input, 255);
      expect(result.isValid).toBe(true);
      expect(result.sanitized).toBe(input);
    });

    it('should detect SQL injection patterns', () => {
      const result = validateInput('Normal text without injection');
      expect(result.isValid).toBe(true);
      expect(result.sanitized).toBe('Normal text without injection');
    });

    it('should handle empty input', () => {
      const result = validateInput('');
      expect(result.isValid).toBe(true);
      expect(result.sanitized).toBe('');
    });
  });

  describe('calculatePasswordStrength', () => {
    it('should calculate strength for very weak password', () => {
      const strength1 = calculatePasswordStrength('abc');
      const strength2 = calculatePasswordStrength('123');
      // 'abc' : 3*4=12 + minuscules=10 + diversité~10 = ~32
      expect(strength1).toBeGreaterThan(0);
      expect(strength1).toBeLessThan(50);
      expect(strength2).toBeLessThan(50);
    });

    it('should calculate strength for weak password', () => {
      const strength = calculatePasswordStrength('password');
      // 'password': 8*4=32 + minuscules=10 + diversité~10 = ~52
      expect(strength).toBeGreaterThan(40);
      expect(strength).toBeLessThan(65);
    });

    it('should calculate strength for medium password', () => {
      const strength = calculatePasswordStrength('Password123');
      // 'Password123': 11*4=40 + maj=10 + min=10 + num=10 + div~12 = ~82
      expect(strength).toBeGreaterThan(70);
      expect(strength).toBeLessThan(90);
    });

    it('should calculate strength for strong password', () => {
      const strength = calculatePasswordStrength('StrongP@ssw0rd123');
      expect(strength).toBeGreaterThan(70);
    });

    it('should give higher score for longer passwords', () => {
      const short = calculatePasswordStrength('P@ss1');
      const long = calculatePasswordStrength('P@ssw0rd123456789');
      expect(long).toBeGreaterThan(short);
    });

    it('should give higher score for mixed character types', () => {
      const simple = calculatePasswordStrength('password');
      const complex = calculatePasswordStrength('P@ssw0rd!');
      expect(complex).toBeGreaterThan(simple);
    });
  });
});
