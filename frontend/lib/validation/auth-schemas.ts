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

const REQUIRED = "Veuillez remplir tous les champs";
const PASSWORD_RULES =
  "Le mot de passe doit faire 8+ caractères, avec majuscule, minuscule, chiffre et caractère spécial";

export const loginSchema = z.object({
  email: z.string().min(1, REQUIRED).refine(validateEmail, "Format d'email invalide"),
  password: z.string().min(1, REQUIRED),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const registerSchema = z
  .object({
    firstName: z
      .string()
      .min(1, REQUIRED)
      .refine(validateName, "Le prénom n'est pas valide (2-50 caractères, lettres uniquement)"),
    lastName: z
      .string()
      .min(1, REQUIRED)
      .refine(validateName, "Le nom n'est pas valide (2-50 caractères, lettres uniquement)"),
    email: z
      .string()
      .min(1, REQUIRED)
      .refine(validateEmail, "Format d'email invalide")
      .refine((e) => !isDisposableEmail(e), "Les adresses email temporaires ne sont pas autorisées"),
    password: z
      .string()
      .min(1, REQUIRED)
      .refine((p) => validatePassword(p).isValid, PASSWORD_RULES)
      .refine(
        (p) => calculatePasswordStrength(p) >= STRENGTH_FLOOR,
        "Le mot de passe est trop faible. Utilisez un mot de passe plus complexe.",
      ),
    confirmPassword: z.string().min(1, REQUIRED),
  })
  // Vérification croisée : la confirmation doit correspondre. Rattachée au champ `confirmPassword`.
  .refine((d) => d.password === d.confirmPassword, {
    message: "Les mots de passe ne correspondent pas",
    path: ["confirmPassword"],
  });
export type RegisterInput = z.infer<typeof registerSchema>;

/** Premier message d'erreur d'un `ZodError` (pour un toast unique, comme l'UX actuelle). */
export function firstZodError(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Formulaire invalide";
}
