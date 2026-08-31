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
import { ThinkingBar } from "@/components/chat/thinking-bar";
import { OnboardingShell } from "@/components/onboarding/onboarding-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { getAvatarUrl } from "@/lib/utils/avatar";

/**
 * Wizard d'onboarding - universel (tous les comptes, au 1ᵉʳ login), sautable.
 *
 * <p>Il nourrit la base de connaissances du Smart Assign : l'étape « compétences » alimente
 * {@code member_skill_profiles} via l'endpoint existant. Le rôle saisi à l'étape 1 amorce la
 * suggestion IA de tags (Qwen local, bornée côté serveur, repli déterministe).</p>
 *
 * <p>Toutes les données sont enregistrées à la fin, en <b>best-effort</b> : un échec sur les
 * compétences / le workspace / les invitations n'empêche pas de terminer. Seul l'appel qui lève le
 * drapeau {@code onboardingCompleted} est bloquant - sinon l'utilisateur resterait piégé dans le
 * wizard. On recharge en dur à la fin pour repartir sur un état d'auth frais.</p>
 */

const SENIORITIES: { value: Seniority; label: string }[] = [
  { value: "JUNIOR", label: "Junior" },
  { value: "MID", label: "Mid-level" },
  { value: "SENIOR", label: "Senior" },
  { value: "LEAD", label: "Lead" },
];

const STEPS = ["You", "Skills", "Team", "First project"];
const TOTAL = STEPS.length;

/** Phases défilées pendant la génération des suggestions (loader « vivant », sans label). */
const SUGGESTION_PHASES = [
  "Analyzing your role…",
  "Finding key skills…",
  "Selecting relevant tags…",
];

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
  // Étape la plus avancée atteinte : borne les sauts arrière/avant depuis la checklist latérale
  // (on ne peut revenir que sur une étape déjà vue, jamais sauter une étape non encore atteinte).
  const [maxStep, setMaxStep] = useState(1);
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

  // Mémorise l'étape la plus loin atteinte (jamais décroissante) : c'est la borne des sauts latéraux.
  useEffect(() => {
    setMaxStep((m) => Math.max(m, step));
  }, [step]);

  // Étape 2 : dès qu'on y arrive avec un rôle renseigné, l'IA propose des compétences AUTOMATIQUEMENT
  // (badges cliquables, aucun clic requis de l'utilisateur). Ne se relance pas pour un rôle déjà
  // suggéré ; se relance si le rôle a changé entre-temps.
  useEffect(() => {
    if (step === 2 && slug && jobTitle.trim() && suggestedFor !== jobTitle.trim() && !loadingSuggestions) {
      void fetchSuggestions();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, jobTitle, slug]);

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
      toast.info("First fill in your role in the previous step.");
      return;
    }
    setLoadingSuggestions(true);
    try {
      const tags = await suggestSkills(slug, jobTitle.trim(), skills);
      setSuggestions(tags);
      setSuggestedFor(jobTitle.trim());
      if (tags.length === 0) toast.info("No suggestions right now - add your skills manually.");
    } finally {
      setLoadingSuggestions(false);
    }
  }

  function addInvite() {
    const email = inviteInput.trim().toLowerCase();
    if (!email) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error("Invalid email address.");
      return;
    }
    if (email === user?.email?.toLowerCase()) {
      toast.info("You're already in this workspace.");
      return;
    }
    setInvites((prev) => (prev.includes(email) ? prev : [...prev, email]));
    setInviteInput("");
  }

  async function persistAndLeave() {
    setSubmitting(true);
    // Compétences - le cœur de valeur (Smart Assign). Best-effort.
    if (slug && userId && (skills.length > 0 || seniority || capacity || bio.trim())) {
      try {
        await updateMemberSkills(slug, userId, {
          skills,
          seniority: seniority ?? undefined,
          capacityHoursPerWeek: capacity ? Number(capacity) : undefined,
          profileText: bio.trim() || undefined,
        });
      } catch {
        toast.error("Skills not saved - you can complete them in your profile.");
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
          toast.error(`Invitation not sent to ${email}.`);
        }
      }
    }
    // Premier projet (optionnel). Best-effort.
    if (slug && projectName.trim()) {
      try {
        await createProject(slug, { name: projectName.trim(), identifier: deriveIdentifier(projectName) });
      } catch {
        toast.error("Project not created - you can create it from the dashboard.");
      }
    }
    // Drapeau d'onboarding - BLOQUANT : sans lui, la garde renverrait ici en boucle.
    try {
      await finishOnboarding(jobTitle.trim() || undefined);
      window.location.href = "/";
    } catch {
      toast.error("Unable to finish. Try again.");
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

  // Saut latéral depuis la checklist : borné aux étapes déjà atteintes (cf. maxStep).
  const goToStep = (n: number) => {
    if (n <= maxStep) setStep(n);
  };

  const account = {
    name: user?.displayName || [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "You",
    email: user?.email ?? "",
    avatarUrl: user ? getAvatarUrl(user) : "",
  };

  return (
    <OnboardingShell
      steps={STEPS}
      current={step}
      maxReached={maxStep}
      onSelectStep={goToStep}
      account={account}
      footer={
        <>
          <Button
            variant="ghost"
            onClick={() => setStep((s) => Math.max(1, s - 1))}
            disabled={step === 1 || submitting}
          >
            <ArrowLeft /> Back
          </Button>

          {step < TOTAL ? (
            <Button onClick={() => setStep((s) => Math.min(TOTAL, s + 1))} disabled={!canNext || submitting}>
              Next <ArrowRight />
            </Button>
          ) : (
            <Button onClick={persistAndLeave} disabled={submitting}>
              {submitting ? <Loader2 className="animate-spin" /> : <Check />}
              Finish
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-8">
        {/* ── Étape 1 : Vous ─────────────────────────────────────────── */}
        {step === 1 && (
          <div className="space-y-5">
            <div>
              <h1 className="text-xl font-semibold" style={{ color: "var(--label-primary)" }}>
                Welcome{user?.firstName ? `, ${user.firstName}` : ""} 👋
              </h1>
              <p className="mt-1 text-sm" style={{ color: "var(--label-tertiary)" }}>
                Two minutes to personalize TaskForce and power smart assignment.
              </p>
            </div>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium" style={{ color: "var(--label-secondary)" }}>
                What&apos;s your role?
              </span>
              <Input
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                placeholder="e.g. Back-end developer, Project manager, Designer…"
              />
            </label>
            <div>
              <span className="mb-1.5 block text-sm font-medium" style={{ color: "var(--label-secondary)" }}>
                Seniority <span style={{ color: "var(--label-quaternary)" }}>(optional)</span>
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
                        ? { borderColor: "var(--primary)", background: "var(--primary)", color: "#fff" }
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
                Your skills
              </h1>
              <p className="mt-1 text-sm" style={{ color: "var(--label-tertiary)" }}>
                They help TaskForce suggest the right tasks for you. Add them, or let Cortex suggest some.
              </p>
            </div>

            {/* Suggestions - lancées automatiquement à l'arrivée sur l'étape (cf. useEffect). */}
            <div>
              <div className="mb-2 flex items-center gap-2 text-xs" style={{ color: "var(--label-tertiary)" }}>
                {loadingSuggestions ? (
                  <ThinkingBar phases={SUGGESTION_PHASES} />
                ) : (
                  <>
                    <Sparkles className="h-3.5 w-3.5" style={{ color: "var(--primary)" }} />
                    <span>
                      Suggested by Cortex{suggestedFor ? ` for “${suggestedFor}”` : ""} - click to add
                    </span>
                    {suggestedFor && (
                      <button
                        type="button"
                        onClick={fetchSuggestions}
                        className="underline underline-offset-2 hover:opacity-80"
                      >
                        Regenerate
                      </button>
                    )}
                  </>
                )}
              </div>
              {!loadingSuggestions && suggestions.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {suggestions
                    .filter((s) => !skills.some((k) => k.toLowerCase() === s.toLowerCase()))
                    .map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => addSkill(s)}
                        className="inline-flex items-center gap-1 rounded-full border border-dashed px-3 py-1 text-sm transition-colors hover:opacity-80"
                        style={{ borderColor: "var(--primary)", color: "var(--primary)" }}
                      >
                        <Plus className="h-3 w-3" /> {s}
                      </button>
                    ))}
                </div>
              )}
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium" style={{ color: "var(--label-secondary)" }}>
                Add a skill
              </label>
              <Input
                value={skillInput}
                onChange={(e) => setSkillInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addSkill(skillInput);
                  }
                }}
                placeholder="Type then Enter (e.g. React, Java, Figma…)"
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
                      <button type="button" onClick={() => removeSkill(s)} aria-label={`Remove ${s}`}>
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
                  Capacity (h/wk) <span style={{ color: "var(--label-quaternary)" }}>opt.</span>
                </span>
                <Input
                  value={capacity}
                  onChange={(e) => setCapacity(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))}
                  inputMode="numeric"
                  placeholder="35"
                />
              </label>
            </div>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium" style={{ color: "var(--label-secondary)" }}>
                In one sentence <span style={{ color: "var(--label-quaternary)" }}>(optional)</span>
              </span>
              <Textarea
                value={bio}
                onChange={(e) => setBio(e.target.value.slice(0, 2000))}
                rows={2}
                placeholder="e.g. I enjoy performance topics and developer experience."
                className="resize-none"
              />
            </label>
          </div>
        )}

        {/* ── Étape 3 : Équipe ──────────────────────────────────────── */}
        {step === 3 && (
          <div className="space-y-5">
            <div>
              <h1 className="text-xl font-semibold" style={{ color: "var(--label-primary)" }}>
                Your workspace
              </h1>
              <p className="mt-1 text-sm" style={{ color: "var(--label-tertiary)" }}>
                Name your workspace and invite your team (you can do this later).
              </p>
            </div>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium" style={{ color: "var(--label-secondary)" }}>
                Workspace name
              </span>
              <Input
                value={wsName}
                onChange={(e) => setWsName(e.target.value)}
                placeholder="My team"
              />
            </label>
            <div>
              <span className="mb-1.5 block text-sm font-medium" style={{ color: "var(--label-secondary)" }}>
                Invite teammates <span style={{ color: "var(--label-quaternary)" }}>(optional)</span>
              </span>
              <div className="flex gap-2">
                <Input
                  value={inviteInput}
                  onChange={(e) => setInviteInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addInvite();
                    }
                  }}
                  placeholder="colleague@company.com"
                  type="email"
                />
                <Button type="button" variant="outline" onClick={addInvite} className="shrink-0">
                  Add
                </Button>
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
                        aria-label={`Remove ${email}`}
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
                A first project?
              </h1>
              <p className="mt-1 text-sm" style={{ color: "var(--label-tertiary)" }}>
                Optional - you can also create it later from the dashboard.
              </p>
            </div>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium" style={{ color: "var(--label-secondary)" }}>
                Project name
              </span>
              <Input
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="e.g. Website redesign, Sprint 1…"
              />
              {projectName.trim() && (
                <span className="mt-1.5 block text-xs" style={{ color: "var(--label-tertiary)" }}>
                  Identifier: {deriveIdentifier(projectName)}
                </span>
              )}
            </label>
          </div>
        )}
      </div>
    </OnboardingShell>
  );
}
