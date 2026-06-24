import { ClipboardList, UserCheck, Bot, CalendarDays, BarChart3, Rocket, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Section « outcome → execution » (PROD-9.2) — traduit la phrase YC en pipeline :
 * planning · assignments · AI agents · meetings · reports · delivery.
 * Squelette structurel — le style définitif (Nodus/dark) sera posé dans la passe de styling.
 */
const STEPS = [
  { icon: ClipboardList, label: "Planning",    desc: "Operations, cycles, roadmap" },
  { icon: UserCheck,     label: "Assignments", desc: "AI Smart Assign by skills & load" },
  { icon: Bot,           label: "AI agents",   desc: "Automations & co-pilot" },
  { icon: CalendarDays,  label: "Meetings",    desc: "Context captured, never lost" },
  { icon: BarChart3,     label: "Reports",     desc: "Analytics & AI insights" },
  { icon: Rocket,        label: "Delivery",    desc: "Shipped, on time" },
];

export function OrchestrationPipeline({ className }: { readonly className?: string }) {
  return (
    <section className={cn("w-full py-16", className)}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <p className="text-sm font-medium text-primary mb-2">One platform, end to end</p>
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-foreground">
            From the outcome you describe to the work that ships
          </h2>
          <p className="text-muted-foreground mt-3">
            TaskForce orchestrates every step — your team focuses on outcomes, not coordination.
          </p>
        </div>

        <ol className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            return (
              <li
                key={s.label}
                className="relative flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-4 text-center"
              >
                <span className="absolute left-2 top-2 text-[10px] font-mono text-muted-foreground/50">
                  {String(i + 1).padStart(2, "0")}
                </span>
                {i < STEPS.length - 1 && (
                  <ArrowRight className="pointer-events-none absolute -right-3 top-1/2 hidden h-4 w-4 -translate-y-1/2 text-muted-foreground/30 lg:block" />
                )}
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <p className="text-sm font-semibold text-foreground">{s.label}</p>
                <p className="text-xs text-muted-foreground">{s.desc}</p>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
