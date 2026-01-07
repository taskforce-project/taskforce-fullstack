import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Container from "@/components/layout/Container";

export default function ProFeatures() {
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
                <svg className="inline-block w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
                Pro Features
              </Badge>
              
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight">
                Unlock Advanced{" "}
                <span className="bg-gradient-to-r from-primary via-primary/80 to-primary/60 bg-clip-text text-transparent">
                  Capabilities
                </span>
              </h2>
              
              <p className="text-lg text-muted-foreground">
                Take your productivity to the next level with premium features designed for professional teams and power users.
              </p>

              <div className="grid sm:grid-cols-2 gap-4 pt-4">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center mt-1">
                    <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-semibold mb-1">Advanced Analytics</h3>
                    <p className="text-sm text-muted-foreground">Deep insights into team performance and productivity metrics</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center mt-1">
                    <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-semibold mb-1">AI-Powered Automation</h3>
                    <p className="text-sm text-muted-foreground">Smart task suggestions and automated workflows</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center mt-1">
                    <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-semibold mb-1">Priority Support</h3>
                    <p className="text-sm text-muted-foreground">24/7 dedicated support for your team</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center mt-1">
                    <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-semibold mb-1">Unlimited Integrations</h3>
                    <p className="text-sm text-muted-foreground">Connect with all your favorite tools seamlessly</p>
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-4 pt-4">
                <Button size="lg" className="text-base px-8" asChild>
                  <a href="/pricing">
                    View Pricing
                    <svg className="ml-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </a>
                </Button>
                <Button size="lg" variant="outline" className="text-base px-8" asChild>
                  <a href="/features">Learn More</a>
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
                      <h4 className="text-sm font-medium text-muted-foreground">Team Performance</h4>
                      <p className="text-2xl font-bold">+24% this month</p>
                    </div>
                    <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                      <svg className="h-6 w-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                      </svg>
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
                      <p className="text-xs text-muted-foreground mt-1">Tasks Done</p>
                    </div>
                    <div className="text-center p-4 rounded-lg bg-muted/30">
                      <p className="text-2xl font-bold text-primary">18</p>
                      <p className="text-xs text-muted-foreground mt-1">Projects</p>
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
