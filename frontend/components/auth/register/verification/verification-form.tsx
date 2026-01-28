"use client";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { Progress } from "@/components/ui/progress";
import { usePreferencesStore } from "@/lib/store/preferences-store";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { getRegisterData, clearRegisterData } from "@/lib/auth/register-storage";

export function OTPForm({ className, ...props }: React.ComponentProps<"div">) {
  const router = useRouter();
  const { t } = usePreferencesStore();
  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [otp, setOtp] = useState("");
  const [userEmail, setUserEmail] = useState<string>("");
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    // Récupérer les données des étapes précédentes
    const registerData = getRegisterData();
    if (!registerData) {
      toast.error("Session expirée", {
        description: "Veuillez recommencer le processus d'inscription",
      });
      router.push('/auth/register');
      return;
    }
    
    setUserEmail(registerData.email);
  }, [router]);

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const handleResendCode = async () => {
    setIsResending(true);
    
    try {
      // TODO: Appel API pour renvoyer l'OTP
      // const response = await fetch('/api/auth/resend-otp', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({ email: userEmail })
      // });
      
      await new Promise((resolve) => setTimeout(resolve, 1000));
      toast.success("Code de vérification renvoyé");
      setCountdown(60);
    } catch (error) {
      toast.error(t.common.error, {
        description: "Erreur lors de l'envoi du code",
      });
      console.error("Resend OTP error:", error);
    } finally {
      setIsResending(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (otp.length !== 6) {
      toast.error(t.common.error, {
        description: "Veuillez entrer le code à 6 chiffres",
      });
      return;
    }

    setIsLoading(true);

    try {
      // TODO: Appel API pour vérifier l'OTP
      // const response = await fetch('/api/auth/verify-otp', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({ email: userEmail, otp })
      // });
      
      await new Promise((resolve) => setTimeout(resolve, 1500));
      
      // Nettoyer les données temporaires
      clearRegisterData();
      
      toast.success("Compte vérifié avec succès !", {
        description: "Vous pouvez maintenant vous connecter",
      });
      
      // Redirection vers login
      router.push('/auth/login');
    } catch (error) {
      toast.error(t.common.error, {
        description: "Code de vérification invalide",
      });
      console.error("OTP verification error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const getResendButtonText = () => {
    if (countdown > 0) return `Renvoyer le code dans ${countdown}s`;
    if (isResending) return "Envoi...";
    return "Renvoyer le code";
  };

  return (
    <div
      className={cn("flex flex-col gap-6 md:min-h-112.5 w-[80%]", className)}
      {...props}
    >
      {/* Progress indicator */}
      <div className="w-full space-y-2">
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>Étape 3 sur 3</span>
          <span>100%</span>
        </div>
        <Progress value={100} />
      </div>

      <Card className="flex-1 overflow-hidden p-0">
        <CardContent className="grid flex-1 p-0 md:grid-cols-2">
          <form onSubmit={handleSubmit} className="flex flex-col items-center justify-center p-6 md:p-8">
            <FieldGroup>
              <Field className="items-center text-center">
                <h1 className="text-2xl font-bold">Code de vérification</h1>
                <p className="text-muted-foreground text-sm text-balance">
                  Code envoyé à {userEmail}
                </p>
              </Field>
              <Field>
                <FieldLabel htmlFor="otp" className="sr-only">
                  Code de vérification
                </FieldLabel>
                <InputOTP
                  maxLength={6}
                  id="otp"
                  required
                  value={otp}
                  onChange={setOtp}
                  disabled={isLoading}
                  containerClassName="gap-4"
                >
                  <InputOTPGroup>
                    <InputOTPSlot index={0} />
                    <InputOTPSlot index={1} />
                    <InputOTPSlot index={2} />
                  </InputOTPGroup>
                  <InputOTPSeparator />
                  <InputOTPGroup>
                    <InputOTPSlot index={3} />
                    <InputOTPSlot index={4} />
                    <InputOTPSlot index={5} />
                  </InputOTPGroup>
                </InputOTP>
                <FieldDescription className="text-center">
                  Entrez le code à 6 chiffres envoyé par email.
                </FieldDescription>
              </Field>
              <Field>
                <Button type="submit" disabled={isLoading || otp.length !== 6}>
                  {isLoading ? "Vérification..." : "Vérifier"}
                </Button>
                <FieldDescription className="text-center">
                  Vous n&apos;avez pas reçu le code ?{" "}
                  <Button
                    type="button"
                    variant="link"
                    onClick={handleResendCode}
                    disabled={isResending || countdown > 0}
                    className="p-0 h-auto"
                  >
                    {getResendButtonText()}
                  </Button>
                </FieldDescription>
              </Field>
            </FieldGroup>
          </form>
          <div className="bg-gradient relative hidden md:flex md:items-center md:justify-center">
            <span aria-hidden="true"></span>
            <img
              src="/assets/logo/logo_taskforce_tp.png"
              alt="TaskForce Logo"
              className="w-32 h-32 object-contain opacity-40 dark:opacity-30 dark:invert relative z-10"
            />
          </div>
        </CardContent>
      </Card>
      <FieldDescription className="text-center">
        En continuant, vous acceptez nos{" "}
        <a href="/legal-notices">Conditions d&apos;utilisation</a> et{" "}
        <a href="/privacy-policy">Politique de confidentialité</a>.
      </FieldDescription>
    </div>
  );
}
