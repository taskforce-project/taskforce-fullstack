import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Container from "@/components/layout/Container";
import { ChevronRight, Github, Check, Sparkles } from "lucide-react";
import { constants } from "@/config/constants";

export default function Hero() {
  const { hero } = constants;
  
  return (
    <section className="relative w-full pt-20 pb-16 md:pt-32 md:pb-24 overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-primary/5 via-background to-background" />
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(var(--primary),0.15),transparent)]" />
      
      <Container>
        <div className="flex flex-col items-center text-center space-y-8">
          {/* Badge */}
          <Badge variant="secondary" className="px-4 py-1.5 text-sm font-medium">
            <Sparkles className="inline-block w-3 h-3 mr-1.5" />
            {hero.badge}
          </Badge>

          {/* Main heading */}
          <div className="space-y-4 max-w-4xl">
            <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight">
              {hero.title.part1}{" "}
              <span className="bg-gradient-to-r from-primary via-primary/80 to-primary/60 bg-clip-text text-transparent">
                {hero.title.highlight}
              </span>
            </h1>
            <p className="text-lg sm:text-xl md:text-2xl text-muted-foreground max-w-2xl mx-auto">
              {hero.description}
            </p>
          </div>

          {/* CTA buttons */}
          <div className="flex flex-col sm:flex-row gap-4 items-center">
            <Button size="lg" className="text-base px-8 h-12" asChild>
              <a href="/app">
                {hero.buttons.launchApp}
                <ChevronRight className="ml-2 h-4 w-4" />
              </a>
            </Button>
            <Button size="lg" variant="outline" className="text-base px-8 h-12" asChild>
              <a href="https://github.com" target="_blank" rel="noopener noreferrer">
                <Github className="mr-2 h-5 w-5" />
                {hero.buttons.viewGithub}
              </a>
            </Button>
          </div>

          {/* Features badges */}
          <div className="flex flex-wrap gap-4 justify-center items-center pt-4 text-sm text-muted-foreground">
            {hero.features.map((feature, index) => (
              <div key={index} className="flex items-center gap-2">
                <Check className="h-5 w-5 text-primary" />
                <span>{feature}</span>
              </div>
            ))}
          </div>

          {/* Preview mockup */}
          <div className="relative w-full max-w-5xl mt-12">
            <div className="relative rounded-xl border border-border/50 bg-card shadow-2xl overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border/50 bg-muted/30">
                <div className="flex gap-1.5">
                  <div className="h-3 w-3 rounded-full bg-destructive/80" />
                  <div className="h-3 w-3 rounded-full bg-amber-500/80" />
                  <div className="h-3 w-3 rounded-full bg-emerald-500/80" />
                </div>
                <div className="flex-1 flex justify-center">
                  <div className="bg-muted rounded-md px-4 py-1 text-xs text-muted-foreground">
                    {hero.mockup.url}
                  </div>
                </div>
              </div>
              <div className="aspect-[16/10] bg-gradient-to-br from-muted/50 via-background to-muted/30 p-8">
                <div className="h-full w-full rounded-lg border border-border/50 bg-card/50 backdrop-blur-sm p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="h-6 w-32 bg-primary/20 rounded-md animate-pulse" />
                    <div className="h-8 w-24 bg-primary/30 rounded-md animate-pulse" />
                  </div>
                  <div className="space-y-2">
                    <div className="h-16 w-full bg-muted/50 rounded-lg animate-pulse" />
                    <div className="h-16 w-full bg-muted/40 rounded-lg animate-pulse" style={{ animationDelay: '0.1s' }} />
                    <div className="h-16 w-full bg-muted/30 rounded-lg animate-pulse" style={{ animationDelay: '0.2s' }} />
                  </div>
                </div>
              </div>
            </div>
            
            {/* Decorative elements */}
            <div className="absolute -top-4 -left-4 h-24 w-24 bg-primary/20 rounded-full blur-3xl -z-10" />
            <div className="absolute -bottom-4 -right-4 h-32 w-32 bg-primary/10 rounded-full blur-3xl -z-10" />
          </div>
        </div>
      </Container>
    </section>
  );
}
