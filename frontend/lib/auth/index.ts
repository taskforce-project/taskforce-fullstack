/**
 * Auth utilities
 */

export * from "./register-storage";

// Types
export type PlanType = "FREE" | "PRO" | "ENTERPRISE";
export type PlanStatus =
  | "ACTIVE"
  | "CANCELED"
  | "PAST_DUE"
  | "TRIALING"
  | "INCOMPLETE"
  | "UNPAID";

export type AuthUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  displayName: string;
  avatarUrl?: string;
  planType: PlanType;
  planStatus?: PlanStatus;
  isActive?: boolean;
  createdAt?: string;
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
  planType: string; // "FREE" | "PRO" | "PREMIUM" | "ENTERPRISE"
  // Champs optionnels pour le plan ENTERPRISE
  companyName?: string;
  phoneNumber?: string;
  enterpriseMessage?: string;
};
