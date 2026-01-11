import { Button } from "@/components/ui/button";
import { Container } from "@/components/layout/";
import { ChevronRight, Github, Check } from "lucide-react";
import { useTranslation } from "@/contexts/LanguageContext";

export function CTA() {
  const { t } = useTranslation();
  const { cta } = t;
  return (
    <section className="relative w-full py-20 md:py-32 overflow-hidden">
      <div className="absolute inset-0 bg-linear-to-br from-primary/20 via-primary/10 to-background" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_50%,rgba(var(--primary),0.25),transparent)]" />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,transparent_0%,rgba(var(--primary),0.1)_50%,transparent_100%)]" />

      <Container>
        <div className="relative z-10 max-w-4xl mx-auto text-center space-y-8">
          <div className="space-y-4">
            <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight">
              {cta.title.part1}{" "}
              <span className="bg-linear-to-r from-primary via-primary/80 to-primary/60 bg-clip-text text-transparent">
                {cta.title.highlight}
              </span>
            </h2>
            <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto">
              {cta.description}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Button
              size="lg"
              className="text-base px-8 h-12 shadow-lg shadow-primary/20"
              asChild
            >
              <a href="/app">
                {cta.buttons.getStarted}
                <ChevronRight className="ml-2 h-4 w-4" />
              </a>
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="text-base px-8 h-12 transition-all duration-200"
              asChild
            >
              <a
                href="https://github.com"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Github className="mr-2 h-5 w-5" />
                {cta.buttons.viewGithub}
              </a>
            </Button>
          </div>

          <div className="flex flex-wrap gap-6 justify-center items-center pt-4 text-sm text-muted-foreground">
            {cta.features.map((feature) => (
              <div key={feature} className="flex items-center gap-2">
                <Check className="h-5 w-5 text-primary" />
                <span>{feature}</span>
              </div>
            ))}
          </div>

          {/* Decorative elements */}
          <div className="absolute top-0 left-1/4 h-32 w-32 bg-primary/10 rounded-full blur-3xl -z-10 animate-pulse" />
          <div
            className="absolute bottom-0 right-1/4 h-40 w-40 bg-primary/10 rounded-full blur-3xl -z-10 animate-pulse"
            style={{ animationDelay: "1s" }}
          />
        </div>
      </Container>
    </section>
  );
}
