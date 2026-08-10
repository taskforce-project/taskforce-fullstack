"use client";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePreferencesStore } from "@/lib/store/preferences-store";
import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getRegisterData, setRegisterData } from "@/lib/auth/register-storage";
import {
  validateEmail,
  validateName,
  validatePassword,
  sanitizeInput,
  isDisposableEmail,
  calculatePasswordStrength,
} from "@/lib/utils/validation";
import { Loader2 } from "lucide-react";
import { AuthStepper } from "@/components/auth/auth-stepper";
import { Checkbox } from "@/components/ui/checkbox";
import { authService, type AuthChallenge } from "@/lib/api/auth-service";
import { TurnstileWidget } from "@/components/auth/turnstile-widget";

/** Seuil de refus au moment de la soumission — aligné sur la règle métier existante. */
const STRENGTH_FLOOR = 50;

/**
 * Inscription, étape 1 sur 3 : identité et mot de passe.
 *
 * Prénom et nom partagent une ligne : ce sont deux champs courts, les séparer verticalement
 * allongeait la page sans rien clarifier, et l'inscription doit tenir sans défilement.
 *
 * Une jauge de robustesse a été ajoutée sous le mot de passe. Auparavant, la règle des 50 points
 * n'existait qu'à la soumission : on découvrait son mot de passe trop faible **après** avoir cliqué,
 * sans savoir ce qui manquait. Une contrainte qu'on impose doit être visible pendant la saisie.
 */
export function SignupForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const router = useRouter();
  const { t } = usePreferencesStore();
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  const [isHuman, setIsHuman] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [challenge, setChallenge] = useState<AuthChallenge>({
    token: "",
    required: false,
    turnstileSiteKey: "",
    turnstileRequired: false,
  });

  // Retour en arrière depuis l'étape suivante : ré-hydrater le formulaire depuis le stockage de
  // session plutôt que de repartir d'un écran vide (le mot de passe y figure déjà).
  useEffect(() => {
    const saved = getRegisterData();
    if (saved) {
      setFormData((prev) => ({
        ...prev,
        firstName: saved.firstName || prev.firstName,
        lastName: saved.lastName || prev.lastName,
        email: saved.email || prev.email,
        password: saved.password || prev.password,
        confirmPassword: saved.password || prev.confirmPassword,
      }));
    }
  }, []);

  // Pré-remplissage de l'email depuis une invitation (?email=…, PROD-3.5)
  useEffect(() => {
    const invitedEmail = new URLSearchParams(window.location.search).get("email");
    if (invitedEmail) {
      setFormData((prev) => ({ ...prev, email: invitedEmail }));
    }
  }, []);

  // Le défi est demandé au chargement, et non à la soumission : c'est l'écart entre son émission et
  // son usage qui permet au serveur de distinguer une saisie humaine d'un envoi instantané.
  useEffect(() => {
    let annule = false;
    authService.getChallenge().then((c) => {
      if (!annule) setChallenge(c);
    });
    return () => {
      annule = true;
    };
  }, []);

  const strength = useMemo(
    () => (formData.password ? calculatePasswordStrength(formData.password) : 0),
    [formData.password]
  );

  const strengthLabel =
    strength >= 75 ? "Robuste" : strength >= STRENGTH_FLOOR ? "Correct" : "Trop faible";

  const strengthColor =
    strength >= 75
      ? "var(--accent-green)"
      : strength >= STRENGTH_FLOOR
        ? "var(--accent-orange)"
        : "var(--accent-red)";

  // Deux vérifications, une seule sollicitation de l'utilisateur. Turnstile juge le visiteur et le
  // fait mieux qu'une case à cocher : dès qu'il est actif, il la remplace à l'écran. Le défi signé
  // reste vérifié côté serveur dans les deux cas — il ne demande rien à personne.
  const afficheTurnstile = challenge.turnstileRequired && Boolean(challenge.turnstileSiteKey);
  const afficheCaseACocher = !afficheTurnstile && challenge.required;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.firstName || !formData.lastName || !formData.email || !formData.password || !formData.confirmPassword) {
      toast.error(t.common.error, { description: "Veuillez remplir tous les champs" });
      return;
    }
    if (!validateName(formData.firstName)) {
      toast.error(t.common.error, { description: "Le prénom n'est pas valide (2-50 caractères, lettres uniquement)" });
      return;
    }
    if (!validateName(formData.lastName)) {
      toast.error(t.common.error, { description: "Le nom n'est pas valide (2-50 caractères, lettres uniquement)" });
      return;
    }
    if (!validateEmail(formData.email)) {
      toast.error(t.common.error, { description: "Format d'email invalide" });
      return;
    }
    if (isDisposableEmail(formData.email)) {
      toast.error(t.common.error, { description: "Les adresses email temporaires ne sont pas autorisées" });
      return;
    }
    if (formData.password !== formData.confirmPassword) {
      toast.error(t.common.error, { description: t.auth.errors.passwordsDoNotMatch });
      return;
    }
    const passwordValidation = validatePassword(formData.password);
    if (!passwordValidation.isValid) {
      toast.error(t.common.error, { description: passwordValidation.errors[0] });
      return;
    }
    if (calculatePasswordStrength(formData.password) < STRENGTH_FLOOR) {
      toast.error(t.common.error, { description: "Le mot de passe est trop faible. Utilisez un mot de passe plus complexe." });
      return;
    }
    // La case « je ne suis pas un robot » n'est exigée que lorsqu'elle est RÉELLEMENT affichée —
    // c'est-à-dire quand Turnstile est inactif. Quand Turnstile est actif, il REMPLACE la case à
    // l'écran (`afficheCaseACocher` est faux) : `isHuman` reste donc false et l'exiger bloquait
    // l'inscription malgré un Turnstile résolu. Dans ce cas, c'est le jeton Turnstile qui fait foi.
    // Le défi signé maison, lui, part toujours (`challengeToken`) et est vérifié côté serveur.
    if (afficheCaseACocher && !isHuman) {
      toast.error(t.common.error, { description: "Veuillez confirmer que vous n'êtes pas un robot" });
      return;
    }
    if (challenge.turnstileRequired && !turnstileToken) {
      toast.error(t.common.error, { description: "Veuillez compléter la vérification anti-robot" });
      return;
    }

    const sanitizedData = {
      firstName: sanitizeInput(formData.firstName),
      lastName: sanitizeInput(formData.lastName),
      email: sanitizeInput(formData.email),
      password: formData.password,
      // Tout le monde démarre en FREE (modèle Linear) : le choix d'un forfait payant est un upgrade
      // in-app (Réglages → Facturation), une fois le compte créé. Plus d'étape « plan » à l'inscription.
      planType: "FREE",
      // Transportés jusqu'à la vérification, seul moment où l'inscription part vers le serveur.
      challengeToken: challenge.token,
      turnstileToken,
    };

    setIsLoading(true);
    try {
      setRegisterData(sanitizedData);
      router.push("/auth/register/verification");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      toast.error(t.common.error, { description: errorMessage || t.auth.errors.registrationFailed });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={cn("auth-panel auth-panel-wide", className)} {...props}>
      <AuthStepper current={1} />

      {/* Pas de sous-titre ici, contrairement aux autres écrans : le fil d'étapes annonce déjà
          « Étape 1 sur 3 · Votre compte » juste au-dessus, et le titre dit le reste. Une ligne de
          plus ne dirait rien de neuf et coûterait la marge qui permet à l'écran de ne pas défiler
          sur un portable court. */}
      <h1 className="auth-title">Créer votre compte</h1>

      <form onSubmit={handleSubmit} className="mt-3 space-y-2.5">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="firstName" className="auth-label">
              Prénom
            </label>
            <Input
              id="firstName"
              autoComplete="given-name"
              required
              value={formData.firstName}
              onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
              disabled={isLoading}
              className="auth-input"
            />
          </div>
          <div>
            <label htmlFor="lastName" className="auth-label">
              Nom
            </label>
            <Input
              id="lastName"
              autoComplete="family-name"
              required
              value={formData.lastName}
              onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
              disabled={isLoading}
              className="auth-input"
            />
          </div>
        </div>

        <div>
          <label htmlFor="email" className="auth-label">
            Email
          </label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="vous@entreprise.com"
            required
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            disabled={isLoading}
            className="auth-input"
          />
        </div>

        <div>
          <label htmlFor="password" className="auth-label">
            Mot de passe
          </label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            value={formData.password}
            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            disabled={isLoading}
            className="auth-input"
          />

          {/* La place de la jauge est réservée en permanence (`invisible` plutôt que démontage).
              Autrement, la première frappe dans le champ fait grandir le formulaire de 18 pixels et
              tout ce qui suit sursaute — y compris le bouton, sous le curseur. */}
          <div
            className="mt-1.5 flex items-center gap-2"
            aria-hidden={formData.password.length === 0}
            style={{ visibility: formData.password.length > 0 ? "visible" : "hidden" }}
          >
            <div
              className="h-0.5 flex-1 overflow-hidden rounded-full"
              style={{ background: "var(--fill-secondary)" }}
            >
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${Math.min(strength, 100)}%`,
                  background: strengthColor,
                }}
              />
            </div>
            <span className="text-[10px] font-medium" style={{ color: strengthColor }}>
              {strengthLabel}
            </span>
          </div>
        </div>

        <div>
          <label htmlFor="confirmPassword" className="auth-label">
            Confirmer
          </label>
          <Input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            value={formData.confirmPassword}
            onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
            disabled={isLoading}
            className="auth-input"
          />
        </div>

        {/* Vérification humaine et consentement dans un seul bloc. Ce ne sont pas deux sujets
            distincts : ce sont les deux conditions pour continuer, et les regrouper est à la fois
            plus juste et plus court — la hauteur récupérée est celle qui permet à l'écran de tenir
            sans défilement sur un portable court.
            Le libellé dit ce qui est réellement vérifié — « je confirme » et non « prouvez-le » : le
            mécanisme filtre les envois automatisés, il ne prouve pas l'humanité. */}
        <div
          className="mt-3 rounded-md border px-3 py-2"
          style={{ borderColor: "var(--separator)", background: "var(--fill-tertiary)" }}
        >
          {/* Turnstile juge le VISITEUR (empreinte navigateur, réputation). Quand il est actif, il
              remplace la case à cocher : les deux poseraient la même question à l'utilisateur, et
              Turnstile la pose mieux. Le défi signé, lui, reste actif côté serveur en second rideau —
              il juge la SOUMISSION, pas le visiteur, et ne dépend d'aucun tiers. */}
          {afficheTurnstile ? (
            <TurnstileWidget
              siteKey={challenge.turnstileSiteKey}
              onToken={setTurnstileToken}
            />
          ) : (
            afficheCaseACocher && (
              <div className="flex items-center gap-2.5">
                <Checkbox
                  id="isHuman"
                  checked={isHuman}
                  onCheckedChange={(v) => setIsHuman(v === true)}
                  disabled={isLoading}
                />
                <label
                  htmlFor="isHuman"
                  className="cursor-pointer text-xs font-medium select-none"
                  style={{ color: "var(--label-secondary)" }}
                >
                  Je confirme ne pas être un robot
                </label>
              </div>
            )
          )}

          {/* L'indentation aligne le texte sous le libellé de la case à cocher. Elle ne doit donc
              s'appliquer QUE si c'est bien la case qui est affichée au-dessus — pas sous le widget
              Turnstile, qui n'a pas de puce à laquelle s'aligner. */}
          <p
            className={
              afficheCaseACocher
                ? "mt-1.5 pl-6 text-[11px] leading-snug"
                : "mt-2 text-[11px] leading-snug"
            }
            style={{ color: "var(--label-quaternary)" }}
          >
            {/* Formulation resserrée pour tenir sur UNE ligne : sur deux, elle coûtait dix-huit
                pixels au budget de hauteur de l'écran. Le sens est intact. */}
            J&apos;accepte les{" "}
            <Link href="/legal-notices" className="underline underline-offset-2">
              conditions
            </Link>{" "}
            et la{" "}
            <Link href="/privacy-policy" className="underline underline-offset-2">
              politique de confidentialité
            </Link>
            .
          </p>
        </div>

        <Button type="submit" disabled={isLoading} className="auth-submit !mt-3">
          {isLoading ? (<><Loader2 className="size-4 animate-spin" />Un instant…</>) : "Continuer"}
        </Button>
      </form>

      <p className="mt-3 text-center text-xs" style={{ color: "var(--label-tertiary)" }}>
        Vous avez déjà un compte ?{" "}
        <Link href="/auth/login" className="auth-link">
          Se connecter
        </Link>
      </p>
    </div>
  );
}
