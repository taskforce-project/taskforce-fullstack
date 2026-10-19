import { describe, it, expect } from "vitest";
import { ZodError } from "zod";

import { loginSchema, registerSchema, firstZodError } from "./auth-schemas";

// Mot de passe valide (8+ car., maj/min/chiffre/spécial, robustesse ≥ 50).
const STRONG = "P@ssw0rd123!";

const validRegister = {
  firstName: "Jean",
  lastName: "Dupont",
  email: "jean@example.com",
  password: STRONG,
  confirmPassword: STRONG,
};

describe("loginSchema", () => {
  it("accepte un email valide + un mot de passe non vide", () => {
    const r = loginSchema.safeParse({ email: "jean@example.com", password: "x" });
    expect(r.success).toBe(true);
  });

  it("rejette un email mal formé", () => {
    const r = loginSchema.safeParse({ email: "pas-un-email", password: "x" });
    expect(r.success).toBe(false);
    if (!r.success) expect(firstZodError(r.error)).toBe("Invalid email format");
  });

  it("rejette un email vide (champ requis)", () => {
    const r = loginSchema.safeParse({ email: "", password: "x" });
    expect(r.success).toBe(false);
    if (!r.success) expect(firstZodError(r.error)).toBe("Please fill in all fields");
  });

  it("rejette un mot de passe vide (champ requis)", () => {
    const r = loginSchema.safeParse({ email: "jean@example.com", password: "" });
    expect(r.success).toBe(false);
    if (!r.success) expect(firstZodError(r.error)).toBe("Please fill in all fields");
  });
});

describe("registerSchema", () => {
  it("accepte une inscription complète et valide", () => {
    const r = registerSchema.safeParse(validRegister);
    expect(r.success).toBe(true);
  });

  it("rejette un prénom invalide (chiffres)", () => {
    const r = registerSchema.safeParse({ ...validRegister, firstName: "Jean1" });
    expect(r.success).toBe(false);
    if (!r.success) expect(firstZodError(r.error)).toContain("First name is not valid");
  });

  it("rejette un nom invalide (trop court)", () => {
    const r = registerSchema.safeParse({ ...validRegister, lastName: "D" });
    expect(r.success).toBe(false);
    if (!r.success) expect(firstZodError(r.error)).toContain("Last name is not valid");
  });

  it("rejette un email de domaine jetable", () => {
    const r = registerSchema.safeParse({ ...validRegister, email: "jean@mailinator.com" });
    expect(r.success).toBe(false);
    if (!r.success) expect(firstZodError(r.error)).toContain("Temporary email addresses");
  });

  it("rejette un mot de passe qui ne respecte pas les règles", () => {
    const r = registerSchema.safeParse({ ...validRegister, password: "faible", confirmPassword: "faible" });
    expect(r.success).toBe(false);
    if (!r.success) expect(firstZodError(r.error)).toContain("uppercase");
  });

  it("rejette une confirmation qui ne correspond pas (rattachée à confirmPassword)", () => {
    const r = registerSchema.safeParse({ ...validRegister, confirmPassword: "P@ssw0rd456!" });
    expect(r.success).toBe(false);
    if (!r.success) {
      const issue = r.error.issues.find((i) => i.message.includes("don't match"));
      expect(issue).toBeDefined();
      expect(issue?.path).toContain("confirmPassword");
    }
  });
});

describe("firstZodError", () => {
  it("renvoie le message du premier problème (champs traités dans l'ordre déclaré)", () => {
    // email (déclaré avant password) échoue en premier → son message ressort.
    const r = loginSchema.safeParse({ email: "pas-un-email", password: "" });
    expect(r.success).toBe(false);
    if (!r.success) expect(firstZodError(r.error)).toBe("Invalid email format");
  });

  it("a un repli si la liste d'erreurs est vide", () => {
    expect(firstZodError(new ZodError([]))).toBe("Invalid form");
  });
});
