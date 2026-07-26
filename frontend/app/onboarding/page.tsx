"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Sparkles, X, Plus, ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { useAuth, useRequireAuth } from "@/lib/contexts/auth-context";
import { useUserStore } from "@/lib/store/user-store";
import { listWorkspaces, updateWorkspace } from "@/lib/api/workspace-service";
import { createInvitation } from "@/lib/api/invitation-service";
import { createProject } from "@/lib/api/project-service";
import { updateMemberSkills, suggestSkills, type Seniority } from "@/lib/api/skill-service";

/**
 * Wizard d'onboarding — universel (tous les comptes, au 1ᵉʳ login), sautable.
 *
 * <p>Il nourrit la base de connaissances du Smart Assign : l'étape « compétences » alimente
 * {@code member_skill_profiles} via l'endpoint existant. Le rôle saisi à l'étape 1 amorce la
 * suggestion IA de tags (Qwen local, bornée côté serveur, repli déterministe).</p>
 *
 * <p>Toutes les données sont enregistrées à la fin, en <b>best-effort</b> : un échec sur les
 * compétences / le workspace / les invitations n'empêche pas de terminer. Seul l'appel qui lève le
 * drapeau {@code onboardingCompleted} est bloquant — sinon l'utilisateur resterait piégé dans le
 * wizard. On recharge en dur à la fin pour repartir sur un état d'auth frais.</p>
 */

const SENIORITIES: { value: Seniority; label: string }[] = [
  { value: "JUNIOR", label: "Junior" },
  { value: "MID", label: "Confirmé" },
  { value: "SENIOR", label: "Senior" },
  { value: "LEAD", label: "Lead" },
];

const STEPS = ["Vous", "Compétences", "Équipe", "Premier projet"];
const TOTAL = STEPS.length;

/** Dérive un identifiant projet court (3-4 lettres) depuis un nom, pour l'API createProject. */
function deriveIdentifier(name: string): string {
  const letters = name.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return (letters.slice(0, 4) || "PROJ");
}

export default function OnboardingPage() {
  useRequireAuth(); // renvoie vers /auth/login si la session est absente
  const { user, isLoading } = useAuth();
  const finishOnboarding = useUserStore((s) => s.finishOnboarding);

  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  // Contexte (workspace de la personne + son id)
  const [slug, setSlug] = useState<string | null>(null);
  const initialWsName = useRef<string>("");
  const userId = useMemo(() => (user ? Number(user.id) : null), [user]);

  // Étape 1
  const [jobTitle, setJobTitle] = useState("");
  const [seniority, setSeniority] = useState<Seniority | null>(null);

  // Étape 2
  const [skills, setSkills] = useState<string[]>([]);
  const [skillInput, setSkillInput] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [suggestedFor, setSuggestedFor] = useState<string | null>(null);
  const [capacity, setCapacity] = useState<string>("");
  const [bio, setBio] = useState("");

  // Étape 3
  const [wsName, setWsName] = useState("");
  const [inviteInput, setInviteInput] = useState("");
  const [invites, setInvites] = useState<string[]>([]);

  // Étape 4
  const [projectName, setProjectName] = useState("");

  // Charge le workspace de la personne (un compte neuf en a exactement un).
  useEffect(() => {
    let cancelled = false;
    listWorkspaces()
      .then((list) => {
        if (cancelled || list.length === 0) return;
        setSlug(list[0].slug);
        initialWsName.current = list[0].name;
        setWsName(list[0].name);
      })
      .catch(() => {
        /* best-effort : sans workspace, les étapes équipe/projet seront simplement inertes */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Pré-remplit le rôle si déjà connu (rare, mais évite une double saisie).
  useEffect(() => {
    if (user?.jobTitle) setJobTitle(user.jobTitle);
  }, [user]);

  function addSkill(raw: string) {
    const tag = raw.trim();
    if (!tag) return;
    setSkills((prev) =>
      prev.some((s) => s.toLowerCase() === tag.toLowerCase()) || prev.length >= 50 ? prev : [...prev, tag]
    );
    setSkillInput("");
  }

  function removeSkill(tag: string) {
    setSkills((prev) => prev.filter((s) => s !== tag));
  }

  async function fetchSuggestions() {
    if (!slug || !jobTitle.trim()) {
      toast.info("Renseigne d'abord ton rôle à l'étape précédente.");
      return;
    }
    setLoadingSuggestions(true);
    try {
      const tags = await suggestSkills(slug, jobTitle.trim(), skills);
      setSuggestions(tags);
      setSuggestedFor(jobTitle.trim());
      if (tags.length === 0) toast.info("Aucune suggestion pour le moment — ajoute tes compétences à la main.");
    } finally {
      setLoadingSuggestions(false);
    }
  }

  function addInvite() {
    const email = inviteInput.trim().toLowerCase();
    if (!email) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error("Adresse e-mail invalide.");
      return;
    }
    if (email === user?.email?.toLowerCase()) {
      toast.info("Tu es déjà dans ce workspace.");
      return;
    }
    setInvites((prev) => (prev.includes(email) ? prev : [...prev, email]));
    setInviteInput("");
  }

  async function persistAndLeave() {
    setSubmitting(true);
    // Compétences — le cœur de valeur (Smart Assign). Best-effort.
    if (slug && userId && (skills.length > 0 || seniority || capacity || bio.trim())) {
      try {
        await updateMemberSkills(slug, userId, {
          skills,
          seniority: seniority ?? undefined,
          capacityHoursPerWeek: capacity ? Number(capacity) : undefined,
          profileText: bio.trim() || undefined,
        });
      } catch {
        toast.error("Compétences non enregistrées — tu pourras les compléter dans ton profil.");
      }
    }
    // Renommage du workspace (si changé). Best-effort.
    if (slug && wsName.trim() && wsName.trim() !== initialWsName.current) {
      try {
        await updateWorkspace(slug, { name: wsName.trim() });
      } catch {
        /* silencieux */
      }
    }
    // Invitations. Best-effort, une par une.
    if (slug) {
      for (const email of invites) {
        try {
          await createInvitation(slug, { email });
        } catch {
          toast.error(`Invitation non envoyée à ${email}.`);
        }
      }
    }
    // Premier projet (optionnel). Best-effort.
    if (slug && projectName.trim()) {
      try {
        await createProject(slug, { name: projectName.trim(), identifier: deriveIdentifier(projectName) });
      } catch {
        toast.error("Projet non créé — tu pourras le créer depuis le tableau de bord.");
      }
    }
    // Drapeau d'onboarding — BLOQUANT : sans lui, la garde renverrait ici en boucle.
    try {
      await finishOnboarding(jobTitle.trim() || undefined);
      window.location.href = "/";
    } catch {
      toast.error("Impossible de finaliser. Réessaie.");
      setSubmitting(false);
    }
  }

  async function skipAll() {
    setSubmitting(true);
    try {
      await finishOnboarding(undefined);
      window.location.href = "/";
    } catch {
      toast.error("Impossible de passer l'onboarding. Réessaie.");
      setSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="grid min-h-svh place-items-center">
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: "var(--label-tertiary)" }} />
      </div>
    );
  }

  const canNext =
    (step === 1 && jobTitle.trim().length > 0) ||
    step === 2 ||
    step === 3 ||
    step === 4;

  return (
    <div className="grid min-h-svh place-items-center px-4 py-10">
      <div
        className="w-full max-w-xl rounded-2xl border p-8 shadow-sm"
        style={{ borderColor: "var(--border)", background: "var(--surface, var(--background))" }}
      >
        {/* Progression */}
        <div className="mb-1 flex items-center justify-between text-xs" style={{ color: "var(--label-tertiary)" }}>
          <span>
            Étape {step} sur {TOTAL} · {STEPS[step - 1]}
          </span>
          <button
            type="button"
            onClick={skipAll}
            disabled={submitting}
            className="underline underline-offset-2 hover:opacity-80 disabled:opacity-50"
          >
            Passer l&apos;onboarding
          </button>
        </div>
        <div className="mb-6 flex gap-1.5">
          {Array.from({ length: TOTAL }).map((_, i) => (
            <span
              key={i}
              className="h-1 flex-1 rounded-full transition-colors"
              style={{ background: i < step ? "var(--accent-purple)" : "var(--input)" }}
            />
          ))}
        </div>

        {/* ── Étape 1 : Vous ─────────────────────────────────────────── */}
        {step === 1 && (
          <div className="space-y-5">
            <div>
              <h1 className="text-xl font-semibold" style={{ color: "var(--label-primary)" }}>
                Bienvenue{user?.firstName ? `, ${user.firstName}` : ""} 👋
              </h1>
              <p className="mt-1 text-sm" style={{ color: "var(--label-tertiary)" }}>
                Deux minutes pour personnaliser TaskForce et aider l&apos;assignation intelligente.
              </p>
            </div>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium" style={{ color: "var(--label-secondary)" }}>
                Quel est ton rôle ?
              </span>
              <input
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                placeholder="ex. Développeur back-end, Chef de projet, Designer…"
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2"
                style={{ borderColor: "var(--border)", background: "var(--background)", color: "var(--label-primary)" }}
              />
            </label>
            <div>
              <span className="mb-1.5 block text-sm font-medium" style={{ color: "var(--label-secondary)" }}>
                Séniorité <span style={{ color: "var(--label-quaternary)" }}>(optionnel)</span>
              </span>
              <div className="flex flex-wrap gap-2">
                {SENIORITIES.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => setSeniority((cur) => (cur === s.value ? null : s.value))}
                    className="rounded-full border px-3 py-1.5 text-sm transition-colors"
                    style={
                      seniority === s.value
                        ? { borderColor: "var(--accent-purple)", background: "var(--accent-purple)", color: "#fff" }
                        : { borderColor: "var(--border)", color: "var(--label-secondary)" }
                    }
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Étape 2 : Compétences ──────────────────────────────────── */}
        {step === 2 && (
          <div className="space-y-5">
            <div>
              <h1 className="text-xl font-semibold" style={{ color: "var(--label-primary)" }}>
                Tes compétences
              </h1>
              <p className="mt-1 text-sm" style={{ color: "var(--label-tertiary)" }}>
                Elles aident TaskForce à te proposer les bonnes tâches. Ajoute-les, ou laisse l&apos;IA suggérer.
              </p>
            </div>

            <button
              type="button"
              onClick={fetchSuggestions}
              disabled={loadingSuggestions}
              className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors disabled:opacity-60"
              style={{ borderColor: "var(--accent-purple)", color: "var(--accent-purple)" }}
            >
              {loadingSuggestions ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {loadingSuggestions ? "Génération…" : "Suggérer avec l'IA"}
            </button>

            {suggestions.length > 0 && (
              <div>
                <span className="mb-1.5 block text-xs" style={{ color: "var(--label-tertiary)" }}>
                  Suggestions {suggestedFor ? `pour « ${suggestedFor} »` : ""} — clique pour ajouter
                </span>
                <div className="flex flex-wrap gap-2">
                  {suggestions
                    .filter((s) => !skills.some((k) => k.toLowerCase() === s.toLowerCase()))
                    .map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => addSkill(s)}
                        className="inline-flex items-center gap-1 rounded-full border border-dashed px-3 py-1 text-sm transition-colors hover:opacity-80"
                        style={{ borderColor: "var(--border)", color: "var(--label-secondary)" }}
                      >
                        <Plus className="h-3 w-3" /> {s}
                      </button>
                    ))}
                </div>
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-sm font-medium" style={{ color: "var(--label-secondary)" }}>
                Ajouter une compétence
              </label>
              <input
                value={skillInput}
                onChange={(e) => setSkillInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addSkill(skillInput);
                  }
                }}
                placeholder="Tape puis Entrée (ex. React, Java, Figma…)"
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2"
                style={{ borderColor: "var(--border)", background: "var(--background)", color: "var(--label-primary)" }}
              />
              {skills.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {skills.map((s) => (
                    <span
                      key={s}
                      className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm"
                      style={{ background: "var(--accent)", color: "var(--accent-foreground)" }}
                    >
                      {s}
                      <button type="button" onClick={() => removeSkill(s)} aria-label={`Retirer ${s}`}>
                        <X className="h-3 w-3 opacity-60 hover:opacity-100" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium" style={{ color: "var(--label-secondary)" }}>
                  Capacité (h/sem) <span style={{ color: "var(--label-quaternary)" }}>opt.</span>
                </span>
                <input
                  value={capacity}
                  onChange={(e) => setCapacity(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))}
                  inputMode="numeric"
                  placeholder="35"
                  className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2"
                  style={{ borderColor: "var(--border)", background: "var(--background)", color: "var(--label-primary)" }}
                />
              </label>
            </div>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium" style={{ color: "var(--label-secondary)" }}>
                En une phrase <span style={{ color: "var(--label-quaternary)" }}>(optionnel)</span>
              </span>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value.slice(0, 2000))}
                rows={2}
                placeholder="ex. J'aime les sujets perf et l'expérience développeur."
                className="w-full resize-none rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2"
                style={{ borderColor: "var(--border)", background: "var(--background)", color: "var(--label-primary)" }}
              />
            </label>
          </div>
        )}

        {/* ── Étape 3 : Équipe ──────────────────────────────────────── */}
        {step === 3 && (
          <div className="space-y-5">
            <div>
              <h1 className="text-xl font-semibold" style={{ color: "var(--label-primary)" }}>
                Ton espace de travail
              </h1>
              <p className="mt-1 text-sm" style={{ color: "var(--label-tertiary)" }}>
                Nomme ton workspace et invite ton équipe (tu pourras le faire plus tard).
              </p>
            </div>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium" style={{ color: "var(--label-secondary)" }}>
                Nom du workspace
              </span>
              <input
                value={wsName}
                onChange={(e) => setWsName(e.target.value)}
                placeholder="Mon équipe"
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2"
                style={{ borderColor: "var(--border)", background: "var(--background)", color: "var(--label-primary)" }}
              />
            </label>
            <div>
              <span className="mb-1.5 block text-sm font-medium" style={{ color: "var(--label-secondary)" }}>
                Inviter des coéquipiers <span style={{ color: "var(--label-quaternary)" }}>(optionnel)</span>
              </span>
              <div className="flex gap-2">
                <input
                  value={inviteInput}
                  onChange={(e) => setInviteInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addInvite();
                    }
                  }}
                  placeholder="collegue@entreprise.com"
                  className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2"
                  style={{ borderColor: "var(--border)", background: "var(--background)", color: "var(--label-primary)" }}
                />
                <button
                  type="button"
                  onClick={addInvite}
                  className="shrink-0 rounded-lg border px-3 text-sm"
                  style={{ borderColor: "var(--border)", color: "var(--label-secondary)" }}
                >
                  Ajouter
                </button>
              </div>
              {invites.length > 0 && (
                <ul className="mt-3 space-y-1.5">
                  {invites.map((email) => (
                    <li
                      key={email}
                      className="flex items-center justify-between rounded-lg border px-3 py-1.5 text-sm"
                      style={{ borderColor: "var(--border)", color: "var(--label-secondary)" }}
                    >
                      {email}
                      <button
                        type="button"
                        onClick={() => setInvites((prev) => prev.filter((e) => e !== email))}
                        aria-label={`Retirer ${email}`}
                      >
                        <X className="h-3.5 w-3.5 opacity-60 hover:opacity-100" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {/* ── Étape 4 : Premier projet ──────────────────────────────── */}
        {step === 4 && (
          <div className="space-y-5">
            <div>
              <h1 className="text-xl font-semibold" style={{ color: "var(--label-primary)" }}>
                Un premier projet ?
              </h1>
              <p className="mt-1 text-sm" style={{ color: "var(--label-tertiary)" }}>
                Facultatif — tu peux aussi le créer plus tard depuis le tableau de bord.
              </p>
            </div>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium" style={{ color: "var(--label-secondary)" }}>
                Nom du projet
              </span>
              <input
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="ex. Refonte du site, Sprint 1…"
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2"
                style={{ borderColor: "var(--border)", background: "var(--background)", color: "var(--label-primary)" }}
              />
              {projectName.trim() && (
                <span className="mt-1.5 block text-xs" style={{ color: "var(--label-tertiary)" }}>
                  Identifiant : {deriveIdentifier(projectName)}
                </span>
              )}
            </label>
          </div>
        )}

        {/* ── Navigation ────────────────────────────────────────────── */}
        <div className="mt-8 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setStep((s) => Math.max(1, s - 1))}
            disabled={step === 1 || submitting}
            className="inline-flex items-center gap-1 text-sm disabled:opacity-40"
            style={{ color: "var(--label-secondary)" }}
          >
            <ArrowLeft className="h-4 w-4" /> Précédent
          </button>

          {step < TOTAL ? (
            <button
              type="button"
              onClick={() => setStep((s) => Math.min(TOTAL, s + 1))}
              disabled={!canNext || submitting}
              className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-white transition-opacity disabled:opacity-50"
              style={{ background: "var(--accent-purple)" }}
            >
              Suivant <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={persistAndLeave}
              disabled={submitting}
              className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-white transition-opacity disabled:opacity-60"
              style={{ background: "var(--accent-purple)" }}
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Terminer
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
