"use client";

import { usePreferencesStore } from "@/lib/store/preferences-store";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import Link from "next/link";

export interface Step1Data {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  confirmPassword: string;
  acceptTerms: boolean;
}

interface Step1Props {
  data: Step1Data;
  errors: Partial<Record<keyof Step1Data, string>>;
  onChange: (field: keyof Step1Data, value: string | boolean) => void;
  isLoading?: boolean;
}

export function RegisterStep1({ data, errors, onChange, isLoading }: Step1Props) {
  const { t } = usePreferencesStore();

  return (
    <div className="space-y-4">
      {/* First Name & Last Name */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="firstName">{t.auth.register.step1.firstNameLabel}</Label>
          <Input
            id="firstName"
            name="firstName"
            type="text"
            placeholder={t.auth.register.step1.firstNamePlaceholder}
            value={data.firstName}
            onChange={(e) => onChange("firstName", e.target.value)}
            className={errors.firstName ? "border-destructive" : ""}
            disabled={isLoading}
            autoComplete="given-name"
          />
          {errors.firstName && (
            <p className="text-sm text-destructive">{errors.firstName}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="lastName">{t.auth.register.step1.lastNameLabel}</Label>
          <Input
            id="lastName"
            name="lastName"
            type="text"
            placeholder={t.auth.register.step1.lastNamePlaceholder}
            value={data.lastName}
            onChange={(e) => onChange("lastName", e.target.value)}
            className={errors.lastName ? "border-destructive" : ""}
            disabled={isLoading}
            autoComplete="family-name"
          />
          {errors.lastName && (
            <p className="text-sm text-destructive">{errors.lastName}</p>
          )}
        </div>
      </div>

      {/* Email */}
      <div className="space-y-2">
        <Label htmlFor="email">{t.auth.register.step1.emailLabel}</Label>
        <Input
          id="email"
          name="email"
          type="email"
          placeholder={t.auth.register.step1.emailPlaceholder}
          value={data.email}
          onChange={(e) => onChange("email", e.target.value)}
          className={errors.email ? "border-destructive" : ""}
          disabled={isLoading}
          autoComplete="email"
        />
        {errors.email && (
          <p className="text-sm text-destructive">{errors.email}</p>
        )}
      </div>

      {/* Password */}
      <div className="space-y-2">
        <Label htmlFor="password">{t.auth.register.step1.passwordLabel}</Label>
        <Input
          id="password"
          name="password"
          type="password"
          placeholder={t.auth.register.step1.passwordPlaceholder}
          value={data.password}
          onChange={(e) => onChange("password", e.target.value)}
          className={errors.password ? "border-destructive" : ""}
          disabled={isLoading}
          autoComplete="new-password"
        />
        {errors.password && (
          <p className="text-sm text-destructive">{errors.password}</p>
        )}
      </div>

      {/* Confirm Password */}
      <div className="space-y-2">
        <Label htmlFor="confirmPassword">
          {t.auth.register.step1.confirmPasswordLabel}
        </Label>
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          placeholder={t.auth.register.step1.confirmPasswordPlaceholder}
          value={data.confirmPassword}
          onChange={(e) => onChange("confirmPassword", e.target.value)}
          className={errors.confirmPassword ? "border-destructive" : ""}
          disabled={isLoading}
          autoComplete="new-password"
        />
        {errors.confirmPassword && (
          <p className="text-sm text-destructive">{errors.confirmPassword}</p>
        )}
      </div>

      {/* Terms & Conditions */}
      <div className="flex items-start space-x-2">
        <Checkbox
          id="acceptTerms"
          checked={data.acceptTerms}
          onCheckedChange={(checked) => onChange("acceptTerms", checked as boolean)}
          disabled={isLoading}
          className={errors.acceptTerms ? "border-destructive" : ""}
        />
        <label
          htmlFor="acceptTerms"
          className="text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
        >
          {t.auth.register.step1.acceptTerms}{" "}
          <Link
            href="/legal-notices"
            className="text-primary hover:underline"
            target="_blank"
          >
            {t.auth.register.step1.termsLink}
          </Link>{" "}
          {t.auth.register.step1.and}{" "}
          <Link
            href="/privacy-policy"
            className="text-primary hover:underline"
            target="_blank"
          >
            {t.auth.register.step1.privacyLink}
          </Link>
        </label>
      </div>
      {errors.acceptTerms && (
        <p className="text-sm text-destructive ml-6">{errors.acceptTerms}</p>
      )}
    </div>
  );
}
