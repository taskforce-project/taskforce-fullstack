import { Providers } from "@/components/Providers";
import { Header, Footer } from "@/components/layout/";
import {
  Hero,
  OrchestrationPipeline,
  Logos3,
  Feature72,
  Testimonial4,
  AISection,
  Migration,
  CoreCapabilities,
  SelfHosted,
  Mobile,
  Integrations,
  Enterprise,
  Developers,
  Cta,
} from "@/components/sections/";

export default function App() {
  return (
    <Providers>
      <Header />

      {/*
        Ordre de sections agréé (PROD-9, pitch-led / AI-forward) :
        Hero → Logos → Pipeline (outcome→execution) → Smart Assign/IA → Capacités cœur
        → Intégrations → Mobile/Developers → Enterprise/Migration → Self-host → Testimonials → CTA.
        (Squelette validé — la passe de styling Nodus viendra ensuite, section par section.)
      */}
      <main>
        <Hero />
        <Logos3 className="py-12" heading="Trusted by teams at" />
        <OrchestrationPipeline />
        <AISection />
        <CoreCapabilities />
        <Feature72 className="pt-8 pb-16" />
        <Integrations />
        <Mobile />
        <Developers />
        <Enterprise />
        <Migration />
        <SelfHosted />
        <Testimonial4 className="pt-0" />
        <Cta />
      </main>

      <Footer />
    </Providers>
  );
}
