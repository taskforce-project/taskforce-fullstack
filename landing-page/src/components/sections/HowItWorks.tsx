import { Badge } from "@/components/ui/badge";
import Container from "@/components/layout/Container";
import { ChevronRight, Sparkles } from "lucide-react";
import { constants } from "@/config/constants";

const { howItWorks } = constants;

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="relative w-full py-20 md:py-32 bg-muted/30">
      <Container>
        <div className="text-center space-y-4 mb-16">
          <Badge variant="secondary" className="px-4 py-1.5 text-sm font-medium">
            <Sparkles className="inline-block w-3 h-3 mr-1.5" />
            {howItWorks.badge}
          </Badge>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight">
            {howItWorks.title}
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            {howItWorks.description}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {howItWorks.steps.map((step, index) => (
            <div key={index} className="space-y-4">
              <div className="relative inline-flex items-center justify-center">
                <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full animate-pulse" style={{ animationDelay: `${index * 0.2}s` }} />
                <div className="relative flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-lg transform transition-transform duration-500 hover:scale-110">
                  <span className="text-2xl font-bold">{step.number}</span>
                </div>
              </div>
              
              <div className="space-y-2">
                <h3 className="text-xl font-semibold">{step.title}</h3>
                <p className="text-muted-foreground leading-relaxed">
                  {step.description}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="mt-16 text-center">
          <p className="text-muted-foreground mb-4">{howItWorks.cta.question}</p>
          <a
            href="/app"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
          >
            {howItWorks.cta.button}
            <ChevronRight className="h-4 w-4" />
          </a>
        </div>
      </Container>
    </section>
  );
}
