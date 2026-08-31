"use client";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
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
import { usePreferencesStore } from "@/lib/store/preferences-store";
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { getRegisterData, clearRegisterData } from "@/lib/auth/register-storage";
import { validateOTP, globalRateLimiter } from "@/lib/utils/validation";
import { authService } from "@/lib/api";
import { useAuth } from "@/lib/contexts/auth-context";
import { Loader2 } from "lucide-react";

export function OTPForm({ className, ...props }: React.ComponentProps<"div">) {
  const router = useRouter();
  const { refreshUser } = useAuth();
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
      toast.error(t.auth.ui.verifySessionExpired, {
        description: t.auth.ui.verifySessionExpiredDesc,
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
            planType: registerData.planType || "FREE",
            // Émis au chargement de l'étape 1, ils ne sont consommés qu'ici : c'est le seul appel
            // d'inscription réellement envoyé au serveur.
            challengeToken: registerData.challengeToken,
            turnstileToken: registerData.turnstileToken,
          });
          
          toast.success(t.auth.ui.verifyCodeSentTitle, {
            description: t.auth.ui.verifyCodeSentDesc,
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          toast.error(t.common.error, {
            description: errorMessage || t.auth.ui.verifyRegisterError,
          });
          // Ne pas revenir à l'étape 1 si l'utilisateur existe déjà (cas idempotent)
          // L'utilisateur peut toujours entrer son code OTP
        }
      };

      sendRegistration();
    }
  }, [router, t]);

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
        description: t.auth.ui.verifyResendWait.replace("{seconds}", String(timeLeft)),
      });
      return;
    }

    setIsResending(true);
    
    try {
      // Appel API pour renvoyer l'OTP
      await authService.resendOtp(userEmail);
      
      toast.success(t.auth.ui.verifyCodeResent);
      setCountdown(60);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      toast.error(t.common.error, {
        description: errorMessage || t.auth.ui.verifySendError,
      });
    } finally {
      setIsResending(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation format OTP
    if (!validateOTP(otp)) {
      toast.error(t.common.error, {
        description: t.auth.ui.verifyInvalidCode6,
      });
      return;
    }

    setIsLoading(true);

    try {
      // Appel API pour vérifier l'OTP
      const result = await authService.verifyOtp(userEmail, otp);
      
      // Nettoyer les données temporaires
      clearRegisterData();

      // Rafraîchir l'état d'authentification dans le contexte
      refreshUser();

      // Si checkout URL présente (plan payant), rediriger vers Stripe
      if (result.checkoutSessionUrl) {
        toast.info(t.auth.ui.verifyRedirectPayment, {
          description: t.auth.ui.verifyRedirectPaymentDesc,
        });
        globalThis.window.location.href = result.checkoutSessionUrl;
        return;
      }

      // Plan gratuit : compte vérifié, mais plus d'auto-login (tokens émis par Keycloak,
      // qui exige le mot de passe). On redirige vers la connexion.
      toast.success(t.auth.ui.verifySuccessTitle, {
        description: t.auth.ui.verifySuccessDesc,
      });
      router.push('/auth/login');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      toast.error(t.common.error, {
        description: errorMessage || "Code de vérification invalide",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getResendButtonText = () => {
    if (countdown > 0) return t.auth.ui.resendIn.replace("{seconds}", String(countdown));
    if (isResending) return t.auth.ui.sendingShort;
    return t.auth.ui.resendCode;
  };

  return (
    <div className={cn("w-full", className)} {...props}>
      {/* Le fil d'étapes est porté par la page. La barre de progression, le « Étape 3 sur 3 » et le
          bouton retour en position absolue ont été retirés : doublon pour les deux premiers,
          recouvrement de la barre supérieure pour le troisième. Le panneau illustré à droite
          disparaît aussi - il doublait la hauteur de la carte sans rien apporter. */}
      <div>
        <div>
          <form onSubmit={handleSubmit} className="flex flex-col">
            <FieldGroup>
              <Field className="items-center text-center">
                <h1 className="auth-title">{t.auth.ui.verifyTitle}</h1>
                <p className="auth-subtitle">
                  {t.auth.ui.verifySentTo.replace("{email}", userEmail)}
                </p>
              </Field>
              <Field className="items-center">
                <FieldLabel htmlFor="otp" className="sr-only">
                  {t.auth.ui.verifyTitle}
                </FieldLabel>
                <InputOTP
                  maxLength={6}
                  id="otp"
                  required
                  value={otp}
                  onChange={setOtp}
                  disabled={isLoading}
                  containerClassName="gap-4 justify-center"
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
                  {t.auth.ui.verifyOtpHint}
                </FieldDescription>
              </Field>
              <Field>
                <Button type="submit" disabled={isLoading || otp.length !== 6}>
                  {isLoading ? (<><Loader2 className="size-4 animate-spin" /> {t.auth.ui.verifying}</>) : t.auth.ui.verifyButton}
                </Button>
                <FieldDescription className="text-center">
                  {t.auth.ui.verifyNotReceived}{" "}
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
        </div>
      </div>

      <p className="mt-5 text-center text-xs">
        <button
          type="button"
          onClick={() => router.push("/auth/register")}
          disabled={isLoading}
          className="auth-link-muted disabled:opacity-50"
        >
          {t.auth.ui.backToRegister}
        </button>
      </p>
    </div>
  );
}
