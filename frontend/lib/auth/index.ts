/**
 * Auth utilities
 */

export * from "./register-storage";

// Types
export type AuthUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  plan: "free" | "pro" | "enterprise";
};

export type LoginCredentials = {
  email: string;
  password: string;
};

export type RegisterCredentials = {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
};
