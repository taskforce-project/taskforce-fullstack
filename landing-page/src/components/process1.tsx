import { ArrowRight } from "lucide-react";
import React, { useId } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Process1Props {
  className?: string;
}

const Process1 = ({ className }: Process1Props) => {
  const process = [
    {
      step: "WEEK 1",
      title: "Discovery and set-up.",
      description:
        "We run discovery scripts on your existing setup. We map every issue, attachment, comment, and automation. You get a migration plan tailored to your organization.",
    },
    {
      step: "WEEK 2",
      title: "Run in parallel",
      description:
        "Define workflows that match how your team actually works. Connect to Slack, GitHub, Figma, and 50+ tools. Set up initiatives, cycles, and team structures.",
    },
    {
      step: "WEEK 3",
      title: "Cut over and onboard",
      description:
        "Experience a tool that moves as fast as you do. AI already knows your projects, your blockers, your priorities. No more fighting your software to get work done.",
    },
  ];

  return (
    <section className={cn("py-24 border-b border-border/40", className)}>
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-6 lg:gap-20">
          <div className="top-10 col-span-2 h-fit w-fit gap-3 space-y-7 py-8 lg:sticky">
            <div className="relative w-fit text-5xl font-semibold tracking-tight lg:text-7xl">
              <h1 className="w-fit">Migration</h1>
              <span className="absolute -top-2 -right-2 md:size-10 lg:-right-14">
                <GradientAsterisk className="size-5 md:size-10" />
              </span>
            </div>
            <p className="text-base text-foreground/50">
              Migrate your data, workflows, and teams in three focused weeks without losing context or delivery speed.
            </p>

            <div className="mt-9 flex flex-nowrap items-center gap-3">
              <Button asChild className="cursor-pointer bg-foreground text-white hover:bg-foreground/90">
                <a href="http://localhost:3000/auth/register">Get started for free</a>
              </Button>
              <Button asChild variant="ghost" className="cursor-pointer items-center justify-start gap-2 px-0 hover:bg-transparent">
                <a href="/contact" className="inline-flex items-center gap-2 whitespace-nowrap">
                  Talk to a migration expert
                  <ArrowRight className="h-4 w-4" />
                </a>
              </Button>
            </div>
          </div>
          <ul className="relative col-span-4 w-full lg:pl-22">
            {process.map((step, index) => (
              <li
                key={step.step}
                className="relative flex flex-col justify-between gap-10 border-t py-8 md:flex-row lg:py-10"
              >
                <Illustration className="absolute top-4 right-0" />

                <div className="flex size-12 items-center justify-center bg-muted px-4 py-1 tracking-tighter">
                  0{index + 1}
                </div>
                <div className="">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{step.step}</p>
                  <h3 className="mb-4 text-2xl font-semibold tracking-tighter lg:text-3xl">
                    {step.title}
                  </h3>
                  <p className="text-foreground/50">{step.description}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
};

export { Process1 };

const Illustration = (props: React.SVGProps<SVGSVGElement>) => {
  const gradientId = useId();

  return (
    <svg
      width="22"
      height="20"
      viewBox="0 0 22 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="22" y2="20" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#f97316" />
          <stop offset="50%" stopColor="#ef4444" />
          <stop offset="100%" stopColor="#e11d48" />
        </linearGradient>
      </defs>
      <line
        x1="0.607422"
        y1="2.57422"
        x2="21.5762"
        y2="2.57422"
        stroke={`url(#${gradientId})`}
        strokeWidth="4"
      />
      <line
        x1="19.5762"
        y1="19.624"
        x2="19.5762"
        y2="4.57422"
        stroke={`url(#${gradientId})`}
        strokeWidth="4"
      />
    </svg>
  );
};

const GradientAsterisk = ({ className }: { className?: string }) => {
  const gradientId = useId();

  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#f97316" />
          <stop offset="50%" stopColor="#ef4444" />
          <stop offset="100%" stopColor="#e11d48" />
        </linearGradient>
      </defs>
      <path d="M12 3v18M3 12h18M5.64 5.64l12.72 12.72M18.36 5.64 5.64 18.36" stroke={`url(#${gradientId})`} strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
};
