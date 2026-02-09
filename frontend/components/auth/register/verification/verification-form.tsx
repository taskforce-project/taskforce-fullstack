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
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { getRegisterData, clearRegisterData } from "@/lib/auth/register-storage";
import { validateOTP, globalRateLimiter } from "@/lib/utils/validation";
import { authService } from "@/lib/api";

export function OTPForm({ className, ...props }: React.ComponentProps<"div">) {
  const router = useRouter();
  const { t } = usePreferencesStore();
  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [otp, setOtp] = useState("");
  const [userEmail, setUserEmail] = useState<string>("");
  const [countdown, setCountdown] = useState(0);
  const hasSentRegistration = useRef(false);

  useEffect(() => {
    // Récupérer les données des étapes précédentes et envoyer l'inscription
    const registerData = getRegisterData();
    if (!registerData?.email || !registerData?.password || !registerData?.firstName || !registerData?.lastName || !registerData?.planType) {
      toast.error("Session expirée ou données incomplètes", {
        description: "Veuillez recommencer le processus d'inscription",
      });
      router.push('/auth/register');
      return;
    }
    
    setUserEmail(registerData.email);

    // Envoyer l'inscription avec toutes les données si pas déjà fait
    // useRef empêche le double appel en React StrictMode (dev)
    if (!hasSentRegistration.current) {
      hasSentRegistration.current = true;
      
      const sendRegistration = async () => {
        try {
          await authService.register({
            email: registerData.email,
            password: registerData.password,
            firstName: registerData.firstName,
            lastName: registerData.lastName,
            planType: registerData.planType,
          });
          
          toast.success("Code de vérification envoyé", {
            description: "Consultez votre boîte mail",
          });
        } catch (error: any) {
          toast.error(t.common.error, {
            description: error.message || "Erreur lors de l'inscription",
          });
          console.error("Registration error:", error);
          // Ne pas revenir à l'étape 1 si l'utilisateur existe déjà (cas idempotent)
          // L'utilisateur peut toujours entrer son code OTP
        }
      };

      sendRegistration();
    }
  }, [router, t.common.error]);

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const handleResendCode = async () => {
    // Rate limiting - 1 renvoi par minute
    if (!globalRateLimiter.isAllowed("resend-otp", 1, 60 * 1000)) {
      const timeLeft = globalRateLimiter.getTimeUntilReset("resend-otp", 60 * 1000);
      toast.error(t.common.error, {
        description: `Veuillez attendre ${timeLeft} secondes avant de renvoyer le code`,
      });
      return;
    }

    setIsResending(true);
    
    try {
      // Appel API pour renvoyer l'OTP
      await authService.resendOtp(userEmail);
      
      toast.success("Code de vérification renvoyé");
      setCountdown(60);
    } catch (error: any) {
      toast.error(t.common.error, {
        description: error.message || "Erreur lors de l'envoi du code",
      });
      console.error("Resend OTP error:", error);
    } finally {
      setIsResending(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation format OTP
    if (!validateOTP(otp)) {
      toast.error(t.common.error, {
        description: "Veuillez entrer un code à 6 chiffres valide",
      });
      return;
    }

    setIsLoading(true);

    try {
      // Appel API pour vérifier l'OTP
      await authService.verifyOtp(userEmail, otp);
      
      // Nettoyer les données temporaires
      clearRegisterData();
      
      toast.success("Compte vérifié avec succès !", {
        description: "Vous pouvez maintenant vous connecter",
      });
      
      // Redirection vers login
      router.push('/auth/login');
    } catch (error: any) {
      toast.error(t.common.error, {
        description: error.message || "Code de vérification invalide",
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
              className="w-60 h-60 object-contain opacity-40 dark:opacity-30 dark:invert relative z-10"
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
