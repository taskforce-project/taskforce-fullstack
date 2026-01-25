"use client";

import { useState } from "react";
import { usePreferencesStore } from "@/lib/store/preferences-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import Link from "next/link";

interface LoginFormData {
  email: string;
  password: string;
  rememberMe: boolean;
}

interface LoginFormErrors {
  email?: string;
  password?: string;
}

export function LoginForm() {
  const { t } = usePreferencesStore();
  const [formData, setFormData] = useState<LoginFormData>({
    email: "",
    password: "",
    rememberMe: false,
  });
  const [errors, setErrors] = useState<LoginFormErrors>({});
  const [isLoading, setIsLoading] = useState(false);

  const validateForm = (): boolean => {
    const newErrors: LoginFormErrors = {};

    // Email validation
    if (!formData.email) {
      newErrors.email = t.auth.errors.emailRequired;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = t.auth.errors.invalidEmail;
    }

    // Password validation
    if (!formData.password) {
      newErrors.password = t.auth.errors.passwordRequired;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      toast.error(t.common.error, {
        description: Object.values(errors)[0],
      });
      return;
    }

    setIsLoading(true);

    try {
      // TODO: Replace with actual API call
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Simulate success
      toast.success(t.auth.success.loginSuccess);
      
      // TODO: Redirect to dashboard
      console.log("Login successful:", formData);
    } catch (error) {
      toast.error(t.common.error, {
        description: t.auth.errors.loginFailed,
      });
      console.error("Login error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
    // Clear error when user types
    if (errors[name as keyof LoginFormErrors]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }));
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Email Field */}
      <div className="space-y-2">
        <Label htmlFor="email">{t.auth.login.emailLabel}</Label>
        <Input
          id="email"
          name="email"
          type="email"
          placeholder={t.auth.login.emailPlaceholder}
          value={formData.email}
          onChange={handleChange}
          className={errors.email ? "border-destructive" : ""}
          disabled={isLoading}
          autoComplete="email"
        />
        {errors.email && (
          <p className="text-sm text-destructive">{errors.email}</p>
        )}
      </div>

      {/* Password Field */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">{t.auth.login.passwordLabel}</Label>
          <Link
            href="/auth/forgot-password"
            className="text-sm text-muted-foreground hover:text-primary transition-colors"
          >
            {t.auth.login.forgotPassword}
          </Link>
        </div>
        <Input
          id="password"
          name="password"
          type="password"
          placeholder={t.auth.login.passwordPlaceholder}
          value={formData.password}
          onChange={handleChange}
          className={errors.password ? "border-destructive" : ""}
          disabled={isLoading}
          autoComplete="current-password"
        />
        {errors.password && (
          <p className="text-sm text-destructive">{errors.password}</p>
        )}
      </div>

      {/* Remember Me */}
      <div className="flex items-center space-x-2">
        <Checkbox
          id="rememberMe"
          name="rememberMe"
          checked={formData.rememberMe}
          onCheckedChange={(checked) =>
            setFormData((prev) => ({ ...prev, rememberMe: checked as boolean }))
          }
          disabled={isLoading}
        />
        <label
          htmlFor="rememberMe"
          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
        >
          {t.auth.login.rememberMe}
        </label>
      </div>

      {/* Submit Button */}
      <Button
        type="submit"
        className="w-full"
        disabled={isLoading}
      >
        {isLoading ? t.common.loading : t.auth.login.signInButton}
      </Button>
    </form>
  );
}
