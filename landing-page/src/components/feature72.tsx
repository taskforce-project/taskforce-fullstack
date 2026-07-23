import {
  ArrowRight,
  Blocks,
  Globe,
  Layers,
  Palette,
  Rocket,
  Zap,
} from "lucide-react";

import { Button } from "@/components/ui/button";

import { cn } from "@/lib/utils";

interface FeatureCardListItem {
  title: string;
  description: string;
  image: Image;
  href?: string;
  icon?: React.ReactNode;
  label?: string;
}
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

interface FeatureCardListProps {
  heading: string;
  description?: string;
  features?: FeatureCardListItem[];
  buttons?: Buttons;
  className?: string;
}

// Alias plutôt qu'interface vide, comme dans `hero115.tsx` : une interface sans membre propre est
// équivalente à son supertype, et le linter la refuse (`no-empty-object-type`).
type Feature72Props = FeatureCardListProps;
type Props = Partial<Feature72Props>;

const defaultProps: Feature72Props = {
  heading: "Build faster with production ready features",
  description:
    "Every component is built with React, Tailwind CSS, and shadcn/ui. Copy, paste, and customize to match your brand in minutes.",
  features: [
    {
      icon: <Zap className="size-5" />,
      title: "Full Source Code",
      description:
        "Every block ships as plain React you own. No runtime dependency, no SDK lock-in, just copy and customize.",
      image: {
        src: "https://deifkwefumgah.cloudfront.net/shadcnblocks/image-set/modern/saas-details/saas-card-detail-1-4x3.svg",
        alt: "Full Source Code",
      },
      href: "https://www.shadcnblocks.com",
    },
    {
      icon: <Palette className="size-5" />,
      title: "Responsive Design",
      description:
        "Every block adapts seamlessly from mobile to desktop with Tailwind's mobile-first utility classes.",
      image: {
        src: "https://deifkwefumgah.cloudfront.net/shadcnblocks/image-set/modern/saas-details/saas-card-detail-2-4x3.svg",
        alt: "Responsive Design",
      },
      href: "https://www.shadcnblocks.com",
    },
    {
      icon: <Layers className="size-5" />,
      title: "Customizable",
      description:
        "Override any prop, swap icons, adjust spacing — every block is designed to be extended, not locked down.",
      image: {
        src: "https://deifkwefumgah.cloudfront.net/shadcnblocks/image-set/modern/saas-details/saas-card-detail-3-4x3.svg",
        alt: "Customizable",
      },
      href: "https://www.shadcnblocks.com",
    },
    {
      icon: <Rocket className="size-5" />,
      title: "Production Ready",
      description:
        "Battle-tested in real projects. No placeholder hacks, no lorem ipsum — clean code you can ship today.",
      image: {
        src: "https://deifkwefumgah.cloudfront.net/shadcnblocks/image-set/modern/saas-details/saas-card-detail-4-4x3.svg",
        alt: "Production Ready",
      },
      href: "https://www.shadcnblocks.com",
    },
    {
      icon: <Blocks className="size-5" />,
      title: "Registry Compatible",
      description:
        "Install blocks directly with the shadcn CLI. Dependencies and registry items are listed in every block's MDX.",
      image: {
        src: "https://deifkwefumgah.cloudfront.net/shadcnblocks/image-set/modern/saas-details/saas-card-detail-5-4x3.svg",
        alt: "Registry Compatible",
      },
      href: "https://www.shadcnblocks.com",
    },
    {
      icon: <Globe className="size-5" />,
      title: "Framework Agnostic",
      description:
        "Plain ESM + React that works with Next.js, Vite, Remix, and Astro without any Shadcnblocks SDK.",
      image: {
        src: "https://deifkwefumgah.cloudfront.net/shadcnblocks/image-set/modern/saas-details/saas-card-detail-6-4x3.svg",
        alt: "Framework Agnostic",
      },
      href: "https://www.shadcnblocks.com",
    },
  ],
  buttons: {
    secondary: {
      text: "View all features",
      url: "/#features",
    },
  },
};

const Feature72 = (props: Props) => {
  const { heading, description, buttons, features, className } = {
    ...defaultProps,
    ...props,
  };

  return (
    <section className={cn("py-32", className)}>
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-10 flex flex-col items-center text-center gap-6 lg:mb-16">
          <div className="max-w-3xl">
            <h2 className="mb-4 text-4xl font-semibold tracking-tight text-balance md:text-5xl lg:mb-7">
              {heading}
            </h2>
            {description && (
              <p className="mx-auto max-w-2xl text-muted-foreground text-lg leading-relaxed lg:text-2xl">
                {description}
              </p>
            )}
          </div>
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          {features?.slice(0, 4).map((feature) => (
            <div
              key={feature.title}
              className="group flex flex-col overflow-clip rounded-xl border border-border"
            >
              <a href={feature.href}>
                <img
                  src={feature.image.src}
                  alt={feature.image.alt}
                  className="aspect-4/3 h-full w-full object-cover object-top transition-transform duration-500 ease-out group-hover:scale-105"
                />
              </a>
              <div className="px-6 pt-8 pb-8 md:px-8 md:pb-10 lg:px-10 lg:pb-12">
                <h3 className="mb-2 text-lg font-semibold md:text-2xl">
                  {feature.title}
                </h3>
                <p className="mb-4 text-muted-foreground lg:text-lg">
                  {feature.description}
                </p>
              </div>
            </div>
          ))}
        </div>
        {buttons?.secondary && (
          <div className="mt-8 flex justify-center">
            <Button
              size="lg"
              asChild
              className="bg-foreground text-white hover:bg-foreground/90"
            >
              <a href={buttons.secondary.url} className="inline-flex items-center gap-2">
                {buttons.secondary.text}
                <ArrowRight className="h-4 w-4" />
              </a>
            </Button>
          </div>
        )}
      </div>
    </section>
  );
};

export { Feature72 };
