"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Mail, CheckCircle2, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

export function VerifyEmail() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get("email") || "";

  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [canResend, setCanResend] = useState(false);
  const [countdown, setCountdown] = useState(60);
  const [isVerified, setIsVerified] = useState(false);
  
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Compte à rebours pour le renvoi du code
  useEffect(() => {
    if (countdown > 0 && !canResend) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    } else if (countdown === 0) {
      setCanResend(true);
    }
  }, [countdown, canResend]);

  // Focus automatique sur le premier champ au chargement
  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  const handleChange = (index: number, value: string) => {
    // Accepter seulement les chiffres
    if (!/^\d*$/.test(value)) return;

    const newOtp = [...otp];
    newOtp[index] = value.slice(-1); // Prendre seulement le dernier caractère
    setOtp(newOtp);

    // Passer automatiquement au champ suivant
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    // Supprimer et revenir au champ précédent
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
    
    // Naviguer avec les flèches
    if (e.key === "ArrowLeft" && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
    if (e.key === "ArrowRight" && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData("text").slice(0, 6);
    
    if (!/^\d+$/.test(pastedData)) {
      toast.error("Le code doit contenir uniquement des chiffres");
      return;
    }

    const newOtp = [...otp];
    for (let i = 0; i < pastedData.length && i < 6; i++) {
      newOtp[i] = pastedData[i];
    }
    setOtp(newOtp);

    // Focus sur le dernier champ rempli ou le suivant
    const nextIndex = Math.min(pastedData.length, 5);
    inputRefs.current[nextIndex]?.focus();
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const code = otp.join("");
    if (code.length !== 6) {
      toast.error("Veuillez entrer le code complet à 6 chiffres");
      return;
    }

    setIsVerifying(true);

    // Simulation de la vérification
    setTimeout(() => {
      // Simuler une vérification réussie (dans la vraie vie, appel API)
      if (code === "123456" || code.length === 6) {
        setIsVerified(true);
        toast.success("Email vérifié avec succès !");
        
        // Rediriger vers le dashboard après 2 secondes
        setTimeout(() => {
          router.push("/");
        }, 2000);
      } else {
        toast.error("Code incorrect. Veuillez réessayer.");
        setOtp(["", "", "", "", "", ""]);
        inputRefs.current[0]?.focus();
      }
      setIsVerifying(false);
    }, 1500);
  };

  const handleResend = async () => {
    if (!canResend) return;

    setIsResending(true);
    
    // Simulation de l'envoi du code
    setTimeout(() => {
      toast.success("Un nouveau code a été envoyé à votre adresse email");
      setIsResending(false);
      setCanResend(false);
      setCountdown(60);
      setOtp(["", "", "", "", "", ""]);
      inputRefs.current[0]?.focus();
    }, 1000);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-secondary/5 p-4 py-24">
      <Button
        variant="outline"
        className="fixed top-6 left-6 z-50"
        onClick={() => router.back()}
      >
        <ArrowLeft className="w-4 h-4 mr-2" />
        Retour
      </Button>

      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center justify-center gap-3 mb-4"
          >
            <div className="w-20 h-20 rounded-xl flex items-center justify-center shadow-lg">
              <Image
                src="/favicon.ico"
                alt="TaskForce AI Logo"
                width={80}
                height={80}
                className="w-20 h-20 rounded-md"
              />
            </div>
          </motion.div>
          <motion.h1
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-3xl font-bold mb-2"
          >
            Vérifiez votre email
          </motion.h1>
          <motion.p
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="text-muted-foreground"
          >
            Nous avons envoyé un code de vérification à
            <br />
            <span className="font-semibold text-foreground">{email || "votre adresse email"}</span>
          </motion.p>
        </div>

        <AnimatePresence mode="wait">
          {!isVerified ? (
            <motion.div
              key="verify"
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -40, opacity: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
            >
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Mail className="w-5 h-5" />
                    Code de vérification
                  </CardTitle>
                  <CardDescription>
                    Entrez le code à 6 chiffres reçu par email
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleVerify} className="space-y-6">
                    {/* Champs OTP */}
                    <div className="flex gap-2 justify-center">
                      {otp.map((digit, index) => (
                        <Input
                          key={index}
                          ref={(el) => {
                            inputRefs.current[index] = el;
                          }}
                          type="text"
                          inputMode="numeric"
                          maxLength={1}
                          value={digit}
                          onChange={(e) => handleChange(index, e.target.value)}
                          onKeyDown={(e) => handleKeyDown(index, e)}
                          onPaste={handlePaste}
                          className="w-12 h-14 text-center text-2xl font-bold"
                          disabled={isVerifying}
                        />
                      ))}
                    </div>

                    {/* Bouton de vérification */}
                    <Button
                      type="submit"
                      className="w-full"
                      size="lg"
                      disabled={isVerifying || otp.join("").length !== 6}
                    >
                      {isVerifying ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Vérification...
                        </>
                      ) : (
                        "Vérifier le code"
                      )}
                    </Button>

                    {/* Bouton de renvoi */}
                    <div className="text-center space-y-2">
                      <p className="text-sm text-muted-foreground">
                        Vous n&apos;avez pas reçu le code ?
                      </p>
                      <Button
                        type="button"
                        variant="link"
                        onClick={handleResend}
                        disabled={!canResend || isResending}
                        className="text-sm"
                      >
                        {isResending ? (
                          <>
                            <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                            Envoi en cours...
                          </>
                        ) : canResend ? (
                          "Renvoyer le code"
                        ) : (
                          `Renvoyer le code dans ${countdown}s`
                        )}
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            </motion.div>
          ) : (
            <motion.div
              key="success"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{ duration: 0.5 }}
            >
              <Card className="border-green-500/50 bg-green-500/5">
                <CardContent className="pt-6">
                  <div className="text-center space-y-4">
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ 
                        type: "spring",
                        stiffness: 200,
                        damping: 15,
                        delay: 0.2 
                      }}
                      className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-500/20 mb-4"
                    >
                      <CheckCircle2 className="w-10 h-10 text-green-500" />
                    </motion.div>
                    <div>
                      <h3 className="text-2xl font-bold mb-2">
                        Email vérifié !
                      </h3>
                      <p className="text-muted-foreground">
                        Votre compte a été vérifié avec succès.
                        <br />
                        Redirection en cours...
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Instructions supplémentaires */}
        {!isVerified && (
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.5 }}
            className="mt-6 text-center"
          >
            <div className="bg-muted/50 rounded-lg p-4 text-sm text-muted-foreground">
              <p className="mb-2">💡 <strong>Astuce :</strong></p>
              <ul className="text-left space-y-1 ml-6 list-disc">
                <li>Vérifiez votre dossier spam si vous ne voyez pas l&apos;email</li>
                <li>Le code expire après 15 minutes</li>
                <li>Vous pouvez coller le code directement</li>
              </ul>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
