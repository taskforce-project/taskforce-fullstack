/**
 * Utilitaires de validation renforcée
 * Validations côté client pour sécuriser les inputs utilisateur
 */

import DOMPurify from "isomorphic-dompurify";

/**
 * Sanitize un input en supprimant tout code malveillant
 * @param input - Texte à nettoyer
 * @returns Texte nettoyé
 */
export function sanitizeInput(input: string): string {
  return DOMPurify.sanitize(input, { ALLOWED_TAGS: [] });
}

/**
 * Validation stricte du format email
 * @param email - Email à valider
 * @returns true si email valide
 */
export function validateEmail(email: string): boolean {
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return emailRegex.test(email) && email.length <= 254;
}

/**
 * Validation renforcée du mot de passe
 * Exigences:
 * - Minimum 8 caractères
 * - Au moins une majuscule
 * - Au moins une minuscule
 * - Au moins un chiffre
 * - Au moins un caractère spécial
 * @param password - Mot de passe à valider
 * @returns Objet avec état de validation et messages d'erreur
 */
export function validatePassword(password: string): {
  isValid: boolean;
  errors: string[];
  strength: "weak" | "medium" | "strong";
} {
  const errors: string[] = [];
  
  // Longueur minimale
  if (password.length < 8) {
    errors.push("Le mot de passe doit contenir au moins 8 caractères");
  }
  
  // Au moins une majuscule
  if (!/[A-Z]/.test(password)) {
    errors.push("Le mot de passe doit contenir au moins une majuscule");
  }
  
  // Au moins une minuscule
  if (!/[a-z]/.test(password)) {
    errors.push("Le mot de passe doit contenir au moins une minuscule");
  }
  
  // Au moins un chiffre
  if (!/[0-9]/.test(password)) {
    errors.push("Le mot de passe doit contenir au moins un chiffre");
  }
  
  // Au moins un caractère spécial
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push("Le mot de passe doit contenir au moins un caractère spécial");
  }
  
  // Calculer la force du mot de passe
  let strength: "weak" | "medium" | "strong" = "weak";
  if (errors.length === 0) {
    if (password.length >= 12) {
      strength = "strong";
    } else if (password.length >= 10) {
      strength = "medium";
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    strength,
  };
}

/**
 * Validation du code OTP (6 chiffres)
 * @param otp - Code OTP à valider
 * @returns true si OTP valide
 */
export function validateOTP(otp: string): boolean {
  const otpRegex = /^[0-9]{6}$/;
  return otpRegex.test(otp);
}

/**
 * Validation du nom (prénom ou nom de famille)
 * - Minimum 2 caractères
 * - Maximum 50 caractères
 * - Lettres uniquement (avec accents)
 * @param name - Nom à valider
 * @returns true si nom valide
 */
export function validateName(name: string): boolean {
  const nameRegex = /^[a-zA-ZÀ-ÿ\s'-]{2,50}$/;
  return nameRegex.test(name);
}

/**
 * Validation stricte des inputs pour prévenir XSS
 * @param input - Input à valider
 * @param maxLength - Longueur maximale autorisée
 * @returns Objet avec état de validation
 */
export function validateInput(input: string, maxLength: number = 255): {
  isValid: boolean;
  sanitized: string;
  error?: string;
} {
  // Vérifier la longueur
  if (input.length > maxLength) {
    return {
      isValid: false,
      sanitized: "",
      error: `Le champ ne peut pas dépasser ${maxLength} caractères`,
    };
  }
  
  // Détecter des patterns suspects
  const suspiciousPatterns = [
    /<script/i,
    /javascript:/i,
    /on\w+\s*=/i, // onclick=, onload=, etc.
    /<iframe/i,
  ];
  
  const hasSuspiciousContent = suspiciousPatterns.some(pattern => 
    pattern.test(input)
  );
  
  if (hasSuspiciousContent) {
    return {
      isValid: false,
      sanitized: sanitizeInput(input),
      error: "Le contenu contient des caractères non autorisés",
    };
  }
  
  return {
    isValid: true,
    sanitized: sanitizeInput(input),
  };
}

/**
 * Calcule la force d'un mot de passe (score de 0 à 100)
 * @param password - Mot de passe à évaluer
 * @returns Score de force (0-100)
 */
export function calculatePasswordStrength(password: string): number {
  let score = 0;
  
  // Longueur (max 40 points)
  score += Math.min(password.length * 4, 40);
  
  // Majuscules (10 points)
  if (/[A-Z]/.test(password)) score += 10;
  
  // Minuscules (10 points)
  if (/[a-z]/.test(password)) score += 10;
  
  // Chiffres (10 points)
  if (/[0-9]/.test(password)) score += 10;
  
  // Caractères spéciaux (15 points)
  if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) score += 15;
  
  // Diversité des caractères (15 points)
  const uniqueChars = new Set(password.split("")).size;
  score += Math.min((uniqueChars / password.length) * 15, 15);
  
  return Math.min(score, 100);
}

/**
 * Vérifie si un email appartient à un domaine jetable connu
 * @param email - Email à vérifier
 * @returns true si domaine jetable détecté
 */
export function isDisposableEmail(email: string): boolean {
  const disposableDomains = [
    "tempmail.com",
    "guerrillamail.com",
    "10minutemail.com",
    "throwaway.email",
    "mailinator.com",
    "trashmail.com",
  ];
  
  const domain = email.split("@")[1]?.toLowerCase();
  return disposableDomains.includes(domain);
}

/**
 * Rate limiting côté client
 * Limite le nombre de tentatives sur une période donnée
 */
export class RateLimiter {
  private attempts: Map<string, number[]> = new Map();
  
  /**
   * Vérifie si une action est autorisée
   * @param key - Clé unique pour l'action (ex: "login", "resend-otp")
   * @param maxAttempts - Nombre maximum de tentatives
   * @param windowMs - Fenêtre de temps en millisecondes
   * @returns true si action autorisée
   */
  isAllowed(key: string, maxAttempts: number, windowMs: number): boolean {
    const now = Date.now();
    const attempts = this.attempts.get(key) || [];
    
    // Filtrer les tentatives dans la fenêtre de temps
    const recentAttempts = attempts.filter(time => now - time < windowMs);
    
    if (recentAttempts.length >= maxAttempts) {
      return false;
    }
    
    // Ajouter la nouvelle tentative
    recentAttempts.push(now);
    this.attempts.set(key, recentAttempts);
    
    return true;
  }
  
  /**
   * Réinitialise les tentatives pour une clé
   * @param key - Clé à réinitialiser
   */
  reset(key: string): void {
    this.attempts.delete(key);
  }
  
  /**
   * Obtient le temps restant avant de pouvoir réessayer
   * @param key - Clé de l'action
   * @param windowMs - Fenêtre de temps en millisecondes
   * @returns Temps restant en secondes
   */
  getTimeUntilReset(key: string, windowMs: number): number {
    const attempts = this.attempts.get(key) || [];
    if (attempts.length === 0) return 0;
    
    const oldestAttempt = Math.min(...attempts);
    const resetTime = oldestAttempt + windowMs;
    const remaining = Math.max(0, resetTime - Date.now());
    
    return Math.ceil(remaining / 1000);
  }
}

// Instance globale du rate limiter
export const globalRateLimiter = new RateLimiter();
