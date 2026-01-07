import { Badge } from "@/components/ui/badge";
import Container from "@/components/layout/Container";

const steps = [
  {
    number: "01",
    title: "Create Your Account",
    description: "Sign up in seconds and get started immediately. No credit card required.",
  },
  {
    number: "02",
    title: "Customize Your Workspace",
    description: "Choose a theme, set up your boards, and organize your workflow the way you want.",
  },
  {
    number: "03",
    title: "Invite Your Team",
    description: "Add team members, assign roles, and start collaborating in real-time.",
  },
  {
    number: "04",
    title: "Track & Achieve",
    description: "Monitor progress, analyze productivity, and achieve your goals faster.",
  },
];

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="relative w-full py-20 md:py-32 bg-muted/30">
      <Container>
        <div className="text-center space-y-4 mb-16">
          <Badge variant="secondary" className="px-4 py-1.5 text-sm font-medium">
            ✦ How It Works
          </Badge>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight">
            Simple Process, Beautiful Results
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Get started with TaskForce in just a few simple steps.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 relative">
          {/* Connection line for desktop */}
          <div className="hidden lg:block absolute top-24 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-border to-transparent" />
          
          {steps.map((step, index) => (
            <div key={index} className="relative">
              {/* Step card */}
              <div className="relative z-10 space-y-4">
                <div className="relative inline-flex items-center justify-center">
                  <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full" />
                  <div className="relative flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-lg">
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

              {/* Connector dot */}
              <div className="hidden lg:block absolute top-24 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-primary border-4 border-background z-20" />
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="mt-16 text-center">
          <p className="text-muted-foreground mb-4">Ready to get started?</p>
          <a
            href="/app"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
          >
            Start Now - It's Free
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </a>
        </div>
      </Container>
    </section>
  );
}
