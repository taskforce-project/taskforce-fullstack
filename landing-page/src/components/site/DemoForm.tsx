import { useState, type ChangeEvent, type FormEvent } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * DemoForm — îlot du formulaire de démo.
 *
 * Pas de backend côté landing (le CRM viendra plus tard, cf. [besoin-backend]). Pour rester
 * HONNÊTE et fonctionnel dès maintenant, l'envoi compose un `mailto:` pré-rempli : le client
 * mail du visiteur s'ouvre avec ses infos. Aucune promesse d'envoi qu'on ne tiendrait pas, et
 * un vrai chemin de contact. Le jour où l'API existe, on remplace `onSubmit` par un POST.
 */

const CONTACT_EMAIL = "hello@taskforce.dev";
const TEAM_SIZES = ["1–10", "11–50", "51–200", "200+"] as const;

const FIELD =
  "border-input focus-visible:border-ring focus-visible:ring-ring/50 h-10 w-full rounded-md border bg-transparent px-3 text-[14px] shadow-xs outline-none transition-[color,box-shadow] focus-visible:ring-[3px]";

type Form = {
  name: string;
  email: string;
  company: string;
  size: string;
  message: string;
};

export function DemoForm() {
  const [sent, setSent] = useState(false);
  const [form, setForm] = useState<Form>({
    name: "",
    email: "",
    company: "",
    size: TEAM_SIZES[1],
    message: "",
  });

  const set =
    (key: keyof Form) =>
    (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));

  const mailtoHref = (() => {
    const subject = `Demo request — ${form.company || form.name || "TaskForce"}`;
    const body = [
      `Name: ${form.name}`,
      `Work email: ${form.email}`,
      `Company: ${form.company}`,
      `Team size: ${form.size}`,
      "",
      form.message || "(no message)",
    ].join("\n");
    return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  })();

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    window.location.href = mailtoHref;
    setSent(true);
  };

  if (sent) {
    return (
      <div className="flex flex-col items-center py-8 text-center">
        <span className="flex size-11 items-center justify-center rounded-full bg-emerald-500 text-white">
          <Check className="size-5" strokeWidth={3} />
        </span>
        <h3 className="mt-4 text-[16px] font-semibold text-foreground">Your email is ready to send</h3>
        <p className="text-muted-foreground mt-1.5 max-w-xs text-[13.5px] leading-6">
          Your mail app should have opened with the details filled in. Nothing opened? Write us at{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} className="link-underline text-foreground">
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="df-name">Name</Label>
          <Input id="df-name" required value={form.name} onChange={set("name")} autoComplete="name" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="df-email">Work email</Label>
          <Input
            id="df-email"
            type="email"
            required
            value={form.email}
            onChange={set("email")}
            autoComplete="email"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="df-company">Company</Label>
          <Input id="df-company" value={form.company} onChange={set("company")} autoComplete="organization" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="df-size">Team size</Label>
          <select id="df-size" value={form.size} onChange={set("size")} className={cn(FIELD)}>
            {TEAM_SIZES.map((s) => (
              <option key={s} value={s}>
                {s} people
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="df-message">What would you like to see?</Label>
        <Textarea
          id="df-message"
          rows={4}
          value={form.message}
          onChange={set("message")}
          placeholder="An outcome you'd want a run to tackle, or a question about self-hosting, security…"
        />
      </div>

      <Button type="submit" size="pill" className="mt-1 w-full">
        Request a demo
      </Button>
      <p className="text-muted-foreground text-center text-[12px]">
        Prefer to write directly?{" "}
        <a href={`mailto:${CONTACT_EMAIL}`} className="link-underline text-foreground">
          {CONTACT_EMAIL}
        </a>
      </p>
    </form>
  );
}
