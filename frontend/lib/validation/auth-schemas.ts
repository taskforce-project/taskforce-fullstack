/**
 * Schémas de validation Zod pour les formulaires d'authentification (règle d'or #8 : validation front = Zod).
 *
 * On RÉUTILISE les helpers existants (`lib/utils/validation`) via `.refine(...)` plutôt que de
 * dupliquer les règles (format email, robustesse mot de passe, e-mails jetables…) : Zod devient la
 * couche de validation déclarative, sans changer le comportement ni les messages déjà éprouvés.
 * La barrière serveur (`@Valid` Spring) reste la source d'autorité ; Zod = retour immédiat côté client.
 */
import { z } from "zod";

import {
  validateEmail,
  validateName,
  validatePassword,
  isDisposableEmail,
  calculatePasswordStrength,
} from "@/lib/utils/validation";

/** Seuil de robustesse minimal au moment de la soumission (aligné sur la règle métier existante). */
export const STRENGTH_FLOOR = 50;

const REQUIRED = "Please fill in all fields";
const PASSWORD_RULES =
  "Password must be at least 8 characters, with an uppercase letter, a lowercase letter, a digit and a special character";

export const loginSchema = z.object({
  email: z.string().min(1, REQUIRED).refine(validateEmail, "Invalid email format"),
  password: z.string().min(1, REQUIRED),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const registerSchema = z
  .object({
    firstName: z
      .string()
      .min(1, REQUIRED)
      .refine(validateName, "First name is not valid (2-50 characters, letters only)"),
    lastName: z
      .string()
      .min(1, REQUIRED)
      .refine(validateName, "Last name is not valid (2-50 characters, letters only)"),
    email: z
      .string()
      .min(1, REQUIRED)
      .refine(validateEmail, "Invalid email format")
      .refine((e) => !isDisposableEmail(e), "Temporary email addresses are not allowed"),
    password: z
      .string()
      .min(1, REQUIRED)
      .refine((p) => validatePassword(p).isValid, PASSWORD_RULES)
      .refine(
        (p) => calculatePasswordStrength(p) >= STRENGTH_FLOOR,
        "This password is too weak. Use a more complex password.",
      ),
    confirmPassword: z.string().min(1, REQUIRED),
  })
  // Vérification croisée : la confirmation doit correspondre. Rattachée au champ `confirmPassword`.
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });
export type RegisterInput = z.infer<typeof registerSchema>;

/** Premier message d'erreur d'un `ZodError` (pour un toast unique, comme l'UX actuelle). */
export function firstZodError(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Invalid form";
}
