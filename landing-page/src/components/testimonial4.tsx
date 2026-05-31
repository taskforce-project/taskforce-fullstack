import { Avatar, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowRight } from "lucide-react";
import { Component as EtheralShadow } from "@/components/ui/etheral-shadow";
import { cn } from "@/lib/utils";

interface Testimonial4Props {
  className?: string;
}

const Testimonial4 = ({ className }: Testimonial4Props) => {
  return (
    <section className={cn("mt-8 py-24", className)}>
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <a href="/customers" className="block overflow-hidden rounded-xl shadow-[0_14px_36px_rgba(24,24,27,0.26)] transition-shadow duration-300 hover:shadow-[0_18px_44px_rgba(24,24,27,0.34)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-2" aria-label="Read customer story">
            <Card className="group relative overflow-hidden rounded-xl border-stone-800/70 bg-zinc-950 text-white shadow-none transition-transform duration-300 ease-out hover:scale-[1.008]">
            <div className="absolute inset-0 opacity-95 pointer-events-none" aria-hidden="true">
              <EtheralShadow
                color="rgba(120, 113, 108, 0.88)"
                animation={{ scale: 0, speed: 0 }}
                noise={{ opacity: 0.11, scale: 0.78 }}
              />
            </div>
            <div className="absolute inset-0 bg-linear-to-br from-stone-500/26 via-zinc-500/10 to-neutral-700/24 pointer-events-none" aria-hidden="true" />
            <CardContent className="relative flex h-full min-h-56 flex-col justify-between p-6">
              <img src="/logos/anthropic.svg" alt="Anthropic" className="h-9 w-auto object-contain opacity-95 self-start invert" />
              <div className="space-y-5">
                <p className="text-xl font-semibold leading-tight text-white">
                  Why FortyAU replaced Monday and Trello with Taskforce for flexible project delivery
                </p>
                <span className="inline-flex items-center gap-2 text-base font-medium text-white/90 group-hover:text-white transition-colors">
                  Read customer story <ArrowRight className="h-4 w-4" />
                </span>
              </div>
            </CardContent>
            </Card>
          </a>

          <div className="overflow-hidden rounded-xl lg:col-span-2">
            <Card className="group overflow-hidden rounded-xl border-border bg-background shadow-[0_10px_28px_rgba(15,23,42,0.10)] transition-transform duration-300 ease-out hover:scale-[1.006] lg:col-span-2">
              <CardContent className="flex h-full min-h-56 flex-col justify-between p-6 md:p-8">
                <q className="text-xl font-medium leading-tight lg:text-3xl">
                  The Taskforce team is creating a product that our business has been needing for years. Modern features, flexible workflows, without sacrificing reporting abilities.
                </q>
                <div className="flex flex-wrap items-center gap-4 text-sm">
                  <div>
                    <p className="font-semibold text-foreground">Duane Arnett</p>
                    <p className="text-muted-foreground">FortyAU</p>
                  </div>
                  <div className="h-10 w-px bg-border" />
                  <img src="/logos/anthropic.svg" alt="Anthropic" className="h-8 w-auto object-contain" />
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
          <a href="/customers" className="block overflow-hidden rounded-xl shadow-[0_10px_28px_rgba(15,23,42,0.10)] transition-shadow duration-300 hover:shadow-[0_14px_34px_rgba(15,23,42,0.14)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2" aria-label="Read customer story">
            <Card className="group overflow-hidden rounded-xl border-slate-200 bg-slate-50 text-slate-950 shadow-none transition-transform duration-300 ease-out hover:scale-[1.008]">
              <CardContent className="flex h-full flex-col justify-between gap-5 p-5">
              <q className="text-base font-medium leading-7 text-slate-800">
                Moving from scattered notes to one workspace cut our prep time by half.
              </q>
              <div className="flex items-center gap-4">
                <Avatar className="size-9 rounded-full ring-1 ring-slate-200">
                  <AvatarImage
                    src="https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=200&q=80"
                    alt="Leo Brown"
                  />
                </Avatar>
                <div className="text-sm">
                  <p className="font-semibold">Leo Brown</p>
                  <p className="text-slate-500">Design Ops, Nova</p>
                </div>
              </div>
              <span className="inline-flex items-center gap-2 text-sm font-medium text-slate-700 group-hover:text-slate-950 transition-colors">
                Read customer story <ArrowRight className="h-4 w-4" />
              </span>
              </CardContent>
            </Card>
          </a>

          <a href="/customers" className="block overflow-hidden rounded-xl shadow-[0_14px_34px_rgba(24,24,27,0.26)] transition-shadow duration-300 hover:shadow-[0_18px_40px_rgba(24,24,27,0.32)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2" aria-label="Read customer story">
            <Card className="group overflow-hidden rounded-xl border-violet-950/60 bg-zinc-950 text-white shadow-none transition-transform duration-300 ease-out hover:scale-[1.008]">
              <CardContent className="flex h-full flex-col justify-between gap-5 p-5">
              <q className="text-base font-medium leading-7 text-white/90">
                The product team loves the clarity. The rest of the company loves the speed.
              </q>
              <div className="flex items-center gap-4">
                <Avatar className="size-9 rounded-full ring-1 ring-white/15">
                  <AvatarImage
                    src="https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=200&q=80"
                    alt="Nora Singh"
                  />
                </Avatar>
                <div className="text-sm">
                  <p className="font-semibold">Nora Singh</p>
                  <p className="text-white/70">COO, Orbit Labs</p>
                </div>
              </div>
              <span className="inline-flex items-center gap-2 text-sm font-medium text-white/80 group-hover:text-white transition-colors">
                Read customer story <ArrowRight className="h-4 w-4" />
              </span>
              </CardContent>
            </Card>
          </a>

          <a href="/customers" className="block overflow-hidden rounded-xl shadow-[0_14px_34px_rgba(2,6,23,0.24)] transition-shadow duration-300 hover:shadow-[0_18px_42px_rgba(2,6,23,0.30)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2" aria-label="Read customer story">
            <Card className="group overflow-hidden rounded-xl border-sky-950/60 bg-slate-900 text-white shadow-none transition-transform duration-300 ease-out hover:scale-[1.008]">
              <CardContent className="flex h-full flex-col justify-between gap-5 p-5">
              <q className="text-base font-medium leading-7 text-white/90">
                The customer stories are the same everywhere: fewer meetings, more shipping.
              </q>
              <div className="flex items-center gap-4">
                <Avatar className="size-9 rounded-full ring-1 ring-white/15">
                  <AvatarImage
                    src="https://images.unsplash.com/photo-1507591064344-4c6ce005b128?auto=format&fit=crop&w=200&q=80"
                    alt="Samir Patel"
                  />
                </Avatar>
                <div className="text-sm">
                  <p className="font-semibold">Samir Patel</p>
                  <p className="text-white/70">Founder, Northwind</p>
                </div>
              </div>
              <span className="inline-flex items-center gap-2 text-sm font-medium text-white/80 group-hover:text-white transition-colors">
                Read customer story <ArrowRight className="h-4 w-4" />
              </span>
              </CardContent>
            </Card>
          </a>
        </div>
      </div>
    </section>
  );
};

export { Testimonial4 };
