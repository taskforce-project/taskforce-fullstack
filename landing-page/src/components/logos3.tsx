"use client";

import { cn } from "@/lib/utils";

interface Logo {
  src: string;
  alt: string;
  orbit: "outer" | "inner";
  angle: number;
  className?: string;
}

interface LogosSimpleStaticProps {
  heading: string;
  subline: string;
  logos: Logo[];
  className?: string;
}

type Props = Partial<LogosSimpleStaticProps>;

const defaultProps: LogosSimpleStaticProps = {
  heading: "Helping visionary brands scale & innovate",
  subline:
    "We power some of the world's most successful companies, helping them ship faster and exceed expectations.",
  logos: [
    {
      src: "/logos/amd.png",
      alt: "AMD",
      orbit: "outer",
      angle: 255,
      className: "h-10 w-auto",
    },
    {
      src: "/logos/anthropic.svg",
      alt: "Anthropic",
      orbit: "outer",
      angle: 320,
      className: "h-9 w-auto",
    },
    {
      src: "/logos/canva.png",
      alt: "Canva",
      orbit: "outer",
      angle: 205,
      className: "h-10 w-auto",
    },
    {
      src: "/logos/figma.svg",
      alt: "Figma",
      orbit: "inner",
      angle: 265,
      className: "h-10 w-auto",
    },
    {
      src: "/logos/microsoft.png",
      alt: "Microsoft",
      orbit: "outer",
      angle: 70,
      className: "h-11 w-auto",
    },
    {
      src: "/logos/notion.svg",
      alt: "Notion",
      orbit: "outer",
      angle: 20,
      className: "h-11 w-auto",
    },
    {
      src: "/logos/perplexity.png",
      alt: "Perplexity",
      orbit: "inner",
      angle: 145,
      className: "h-10 w-auto",
    },
    {
      src: "/logos/stripe.png",
      alt: "Stripe",
      orbit: "outer",
      angle: 130,
      className: "h-11 w-auto",
    },
    {
      src: "/logos/vercel.png",
      alt: "Vercel",
      orbit: "inner",
      angle: 35,
      className: "h-10 w-auto",
    },
  ],
};

const Logos3 = (props: Props) => {
  const { heading, subline, logos, className } = {
    ...defaultProps,
    ...props,
  };

  return (
    <section className={cn("py-16", className)}>
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-10 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <h2 className="max-w-xl text-4xl font-semibold tracking-tight text-balance md:text-5xl">
              {heading}
            </h2>
            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">
              {subline}
            </p>
          </div>

          <div className="relative mx-auto w-full max-w-140 aspect-square">
            <div className="absolute left-1/2 top-1/2 h-[86%] w-[86%] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-dashed border-foreground/20" />
            <div className="absolute left-1/2 top-1/2 h-[55%] w-[55%] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-dashed border-foreground/20" />

            <div className="absolute left-1/2 top-1/2 flex h-60 w-60 -translate-x-1/2 -translate-y-1/2 items-center justify-center p-4">
              <img src="/logo_taskforce_tp.png" alt="Taskforce" className="h-full w-full object-contain drop-shadow-[0_10px_24px_rgba(0,0,0,0.16)]" />
            </div>

            {logos.map((logo) => (
              <div
                key={logo.alt}
                className="absolute inset-0"
                style={{ transform: `rotate(${logo.angle}deg)` }}
              >
                <div
                  className={cn(
                    "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2",
                    logo.orbit === "outer"
                      ? "h-[86%] w-[86%] animate-[spin_22s_linear_infinite]"
                      : "h-[55%] w-[55%] animate-[spin_16s_linear_infinite_reverse]",
                  )}
                >
                  <img
                    src={logo.src}
                    alt={logo.alt}
                    className={cn(
                      "absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 object-contain",
                      logo.className,
                    )}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export { Logos3 };
