"use client";

import { useState } from "react";
import { usePreferencesStore } from "@/lib/store/preferences-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import Link from "next/link";
import { ArrowLeft, CheckCircle2 } from "lucide-react";

export default function ForgotPasswordPage() {
  const { t } = usePreferencesStore();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const validateEmail = (email: string): boolean => {
    if (!email) {
      setError(t.auth.errors.emailRequired);
      return false;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError(t.auth.errors.invalidEmail);
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!validateEmail(email)) {
      toast.error(t.common.error, { description: error });
      return;
    }

    setIsLoading(true);

    try {
      // TODO: Replace with actual API call
      await new Promise((resolve) => setTimeout(resolve, 1500));

      toast.success(t.auth.success.passwordResetSent);
      setIsSuccess(true);
    } catch (err) {
      toast.error(t.common.error, {
        description: t.auth.errors.networkError,
      });
      console.error("Password reset error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="w-full max-w-md space-y-8">
        <div className="flex flex-col items-center text-center space-y-4">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
            <CheckCircle2 className="w-8 h-8 text-primary" />
          </div>
          <div className="space-y-2">
            <h2 className="text-3xl font-bold tracking-tight text-foreground">
              {t.auth.passwordReset.checkEmail}
            </h2>
            <p className="text-muted-foreground">
              {t.auth.passwordReset.checkEmailDescription}
            </p>
          </div>
        </div>

        <Card className="p-8 shadow-lg border-border/50">
          <div className="space-y-4 text-center">
            <p className="text-sm text-muted-foreground">
              Nous avons envoyé un lien de réinitialisation à :
            </p>
            <p className="font-medium text-foreground">{email}</p>
            <p className="text-xs text-muted-foreground">
              Si vous ne recevez pas l'email dans quelques minutes, vérifiez votre dossier spam.
            </p>
          </div>
        </Card>

        <div className="text-center">
          <Link
            href="/auth/login"
            className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
          >
            <ArrowLeft className="w-4 h-4" />
            {t.auth.passwordReset.backToLogin}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md space-y-8">
      {/* Logo & Header */}
      <div className="flex flex-col items-center text-center space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-primary rounded-lg flex items-center justify-center">
            <span className="text-2xl font-bold text-primary-foreground">TF</span>
          </div>
          <h1 className="text-2xl font-bold text-foreground">
            {t.common.appName}
          </h1>
        </div>
        <div className="space-y-2">
          <h2 className="text-3xl font-bold tracking-tight text-foreground">
            {t.auth.passwordReset.title}
          </h2>
          <p className="text-muted-foreground">
            {t.auth.passwordReset.subtitle}
          </p>
        </div>
      </div>

      {/* Reset Form */}
      <Card className="p-8 shadow-lg border-border/50">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">{t.auth.passwordReset.emailLabel}</Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder={t.auth.passwordReset.emailPlaceholder}
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (error) setError("");
              }}
              className={error ? "border-destructive" : ""}
              disabled={isLoading}
              autoComplete="email"
              autoFocus
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? t.common.loading : t.auth.passwordReset.sendLinkButton}
          </Button>
        </form>
      </Card>

      {/* Back to Login */}
      <div className="text-center">
        <Link
          href="/auth/login"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          {t.auth.passwordReset.backToLogin}
        </Link>
      </div>
    </div>
  );
}
