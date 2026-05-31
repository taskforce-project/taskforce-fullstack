import { ArrowRight } from "lucide-react";

import { Component as EtheralShadow } from "@/components/ui/etheral-shadow";

export function CTA() {
  return (
    <section className="relative overflow-hidden bg-[#0f1012] py-14 text-white sm:py-16">
      <div className="absolute inset-0 opacity-95" aria-hidden>
        <EtheralShadow
          color="rgba(239, 68, 68, 0.62)"
          animation={{ scale: 0, speed: 0 }}
          noise={{ opacity: 0.08, scale: 0.8 }}
        />
      </div>
      <div className="absolute inset-0 bg-linear-to-r from-orange-500/14 via-red-500/12 to-violet-600/14" aria-hidden />

      <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-col items-center px-4 text-center sm:px-6 lg:px-8">
        <h2 className="max-w-5xl text-4xl font-black tracking-tight sm:text-5xl lg:text-6xl">
          Next-gen project management
          <br />
          starts here
        </h2>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <a
            href="http://localhost:3000/auth/register"
            className="group inline-flex items-center justify-center gap-2 rounded-lg bg-white px-7 py-3.5 text-sm font-semibold text-black transition-colors hover:bg-white/90"
          >
            Get started free
            <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
          </a>
          <a
            href="/contact"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-white/8 px-7 py-3.5 text-sm font-semibold text-white/92 transition-colors hover:bg-white/12"
          >
            Talk to a migration expert
          </a>
        </div>
      </div>
    </section>
  );
}
