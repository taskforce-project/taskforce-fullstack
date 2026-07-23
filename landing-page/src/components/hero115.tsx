import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Image {
  src: string;
  alt: string;
  srcDark?: string;
}
interface Button {
  text: string;
  url: string;
  icon?: React.ReactNode;
}
interface Buttons {
  primary?: Button;
  secondary?: Button;
}

interface HeroBasicProps {
  heading: React.ReactNode;
  description: React.ReactNode;
  buttons?: Buttons;
  image: Image;
  byline?: React.ReactNode;
  className?: string;
  icon?: React.ReactNode;
}

// Alias plutôt qu'interface vide : une interface qui n'ajoute aucun membre est équivalente à son
// supertype, et le linter la refuse à juste titre (`no-empty-object-type`).
type Hero115Props = HeroBasicProps;
type Props = Partial<Hero115Props>;

const defaultProps: Hero115Props = {
  heading: (
    <>
      Project management
      <br />
      <span className="bg-linear-to-r from-blue-500 via-violet-500 to-violet-700 bg-clip-text text-transparent">
        your team deserves
      </span>
    </>
  ),
  description:
    "Tasks, docs, AI, and analytics in one workspace. Less overhead, more shipping.",
  buttons: {
    primary: {
      text: "Start for free",
      url: "http://localhost:3000/auth/register",
    },
    secondary: {
      text: "Talk to sales",
      url: "/contact",
    },
  },
  image: {
    src: "https://deifkwefumgah.cloudfront.net/shadcnblocks/image-set/modern/saas-hero/saas-hero-1-16x9.png",
    alt: "Hero Image Placeholder",
  },
  byline: "In beta · 5,000+ teams",
};

const Hero115 = (props: Props) => {
  const { icon, heading, description, buttons, image, byline, className } = {
    ...defaultProps,
    ...props,
  };

  return (
    <section className={cn("relative overflow-hidden py-28 lg:py-32", className)}>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-20"
      >
        <div className="absolute -top-24 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-orange-400/18 blur-3xl" />
        <div className="absolute top-20 -left-12 h-80 w-80 rounded-full bg-red-400/14 blur-3xl" />
        <div className="absolute top-24 -right-16 h-96 w-96 rounded-full bg-blue-500/14 blur-3xl" />
        <div className="absolute bottom-6 left-1/3 h-80 w-80 rounded-full bg-violet-500/12 blur-3xl" />
      </div>
      <div className="container mx-auto">
        <div className="flex flex-col gap-5">
          <div className="relative isolate flex flex-col gap-5">
            <div
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-1/2 -z-10 mx-auto size-200 -translate-x-1/2 -translate-y-1/2 rounded-full border border-border mask-[linear-gradient(to_top,transparent,transparent,white,white,white,transparent,transparent)] p-16 [-webkit-mask-image:linear-gradient(to_top,transparent,transparent,white,white,white,transparent,transparent)] md:size-325 md:p-32"
            >
              <div className="size-full rounded-full border border-border p-16 md:p-32">
                <div className="size-full rounded-full border border-border" />
              </div>
            </div>
            {icon ? (
              <span className="mx-auto flex size-16 items-center justify-center rounded-full border border-orange-200 bg-white/70 shadow-sm md:size-20">
                {icon}
              </span>
            ) : null}
            <h1 className="mx-auto max-w-xl text-center text-4xl font-semibold tracking-tight text-pretty md:text-5xl lg:max-w-3xl lg:text-6xl">
              {heading}
            </h1>
            <p className="mx-auto max-w-5xl text-center text-lg text-balance text-muted-foreground md:text-xl">
              {description}
            </p>
            <div className="flex flex-col items-center gap-3 pt-3 pb-12">
              <div className="flex w-full flex-col items-center justify-center gap-3 sm:w-auto sm:flex-row">
              {buttons?.primary && (
                <Button
                  size="lg"
                  asChild
                  className="w-full sm:w-auto bg-foreground text-white hover:bg-foreground/90"
                >
                  <a href={buttons.primary.url}>
                    {buttons.primary.text}
                    <ArrowRight className="size-4" />
                  </a>
                </Button>
              )}
              {buttons?.secondary && (
                <Button variant="outline" size="lg" asChild className="w-full sm:w-auto border-orange-200/70 bg-white/70">
                  <a href={buttons.secondary.url}>{buttons.secondary.text}</a>
                </Button>
              )}
              </div>
              {byline && (
                <div className="rounded-full border border-orange-200/60 bg-white/75 px-3 py-1 text-center text-xs text-muted-foreground">
                  {byline}
                </div>
              )}
            </div>
          </div>
          <img
            src={image.src}
            alt={image.alt}
            className="mx-auto aspect-3/4 h-full max-h-131 w-full max-w-5xl rounded-lg border border-orange-200/60 object-cover object-top-left shadow-[0_24px_80px_rgba(30,41,59,0.14)] md:aspect-video md:object-top"
          />
        </div>
      </div>
    </section>
  );
};

export { Hero115 };
