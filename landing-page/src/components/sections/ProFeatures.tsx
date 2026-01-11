import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Container from "@/components/layout/Container";
import { TrendingUp, Check, ChevronRight } from "lucide-react";
import { useTranslation } from "@/contexts/LanguageContext";

export function ProFeatures() {
  const { t } = useTranslation();
  const { proFeatures } = t;
  return (
    <section className="relative w-full py-20 md:py-32 overflow-hidden">
      {/* Background with gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-primary/10 via-primary/5 to-background" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(var(--primary),0.2),transparent)]" />
      
      <Container>
        <div className="relative z-10">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Left side - Content */}
            <div className="space-y-6">
              <Badge variant="secondary" className="px-4 py-1.5 text-sm font-medium">
                <TrendingUp className="inline-block w-4 h-4 mr-2" />
                {proFeatures.badge}
              </Badge>
              
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight">
                {proFeatures.title.part1}{" "}
                <span className="bg-gradient-to-r from-primary via-primary/80 to-primary/60 bg-clip-text text-transparent">
                  {proFeatures.title.highlight}
                </span>
              </h2>
              
              <p className="text-lg text-muted-foreground">
                {proFeatures.description}
              </p>

              <div className="grid sm:grid-cols-2 gap-4 pt-4">
                {proFeatures.features.map((feature, index) => (
                  <div key={index} className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center mt-1">
                      <Check className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold mb-1">{feature.title}</h3>
                      <p className="text-sm text-muted-foreground">{feature.description}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex flex-col sm:flex-row gap-4 pt-4">
                <Button size="lg" className="text-base px-8" asChild>
                  <a href="/pricing">
                    {proFeatures.buttons.pricing}
                    <ChevronRight className="ml-2 h-4 w-4" />
                  </a>
                </Button>
                <Button size="lg" variant="outline" className="text-base px-8" asChild>
                  <a href="/features">{proFeatures.buttons.learnMore}</a>
                </Button>
              </div>
            </div>

            {/* Right side - Visual */}
            <div className="relative">
              <div className="relative rounded-2xl border border-border/50 bg-card shadow-2xl overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/10" />
                <div className="relative p-8 space-y-4">
                  {/* Mock analytics dashboard */}
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h4 className="text-sm font-medium text-muted-foreground">{proFeatures.analytics.title}</h4>
                      <p className="text-2xl font-bold">{proFeatures.analytics.growth}</p>
                    </div>
                    <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                      <TrendingUp className="h-6 w-6 text-primary" />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="h-3 w-full bg-primary/20 rounded-full overflow-hidden">
                      <div className="h-full w-[85%] bg-primary rounded-full animate-pulse" />
                    </div>
                    <div className="h-3 w-full bg-primary/20 rounded-full overflow-hidden">
                      <div className="h-full w-[65%] bg-primary/70 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }} />
                    </div>
                    <div className="h-3 w-full bg-primary/20 rounded-full overflow-hidden">
                      <div className="h-full w-[92%] bg-primary/50 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }} />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4 pt-6">
                    <div className="text-center p-4 rounded-lg bg-muted/30">
                      <p className="text-2xl font-bold text-primary">127</p>
                      <p className="text-xs text-muted-foreground mt-1">{proFeatures.analytics.metrics.tasksDone}</p>
                    </div>
                    <div className="text-center p-4 rounded-lg bg-muted/30">
                      <p className="text-2xl font-bold text-primary">18</p>
                      <p className="text-xs text-muted-foreground mt-1">{proFeatures.analytics.metrics.activeProjects}</p>
                    </div>
                    <div className="text-center p-4 rounded-lg bg-muted/30">
                      <p className="text-2xl font-bold text-primary">5.2h</p>
                      <p className="text-xs text-muted-foreground mt-1">Saved</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Decorative elements */}
              <div className="absolute -top-4 -right-4 h-32 w-32 bg-primary/20 rounded-full blur-3xl" />
              <div className="absolute -bottom-4 -left-4 h-40 w-40 bg-primary/10 rounded-full blur-3xl" />
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
