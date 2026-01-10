"use client";

import { usePreferencesStore } from "@/lib/store/preferences-store";
import { LoginForm } from "./LoginForm";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import Link from "next/link";
import Image from "next/image";

export default function LoginPage() {
  const { t } = usePreferencesStore();

  return (
    <div className="w-full max-w-md space-y-8">
      {/* Logo & Header */}
      <div className="flex flex-col items-center text-center space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-primary rounded-lg flex items-center justify-center">
            <span className="text-2xl font-bold text-primary-foreground">
              TF
            </span>
          </div>
          <h1 className="text-2xl font-bold text-foreground">
            {t.common.appName}
          </h1>
        </div>
        <div className="space-y-2">
          <h2 className="text-3xl font-bold tracking-tight text-foreground">
            {t.auth.login.title}
          </h2>
          <p className="text-muted-foreground">{t.auth.login.subtitle}</p>
        </div>
      </div>

      {/* Login Card */}
      <Card className="p-8 shadow-lg border-border/50">
        <div className="space-y-6">
          {/* OAuth Buttons - For future implementation */}
          <LoginForm />
        </div>
      </Card>

      {/* Sign Up Link */}
      <div className="text-center">
        <p className="text-sm text-muted-foreground">
          {t.auth.login.noAccount}{" "}
          <Link
            href="/auth/register"
            className="font-medium text-primary hover:underline"
          >
            {t.auth.login.signUpLink}
          </Link>
        </p>
      </div>

      {/* Footer Links */}
      <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
        <Link
          href="/legal-notices"
          className="hover:text-foreground transition-colors"
        >
          {t.auth.register.step1.termsLink}
        </Link>
        <span>•</span>
        <Link
          href="/privacy-policy"
          className="hover:text-foreground transition-colors"
        >
          {t.auth.register.step1.privacyLink}
        </Link>
      </div>
    </div>
  );
}
