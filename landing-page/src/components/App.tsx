import { Providers } from "@/components/Providers";
import { Header, Footer } from "@/components/layout/";
import {
  Hero,
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

      <main>
        <Hero />
        <Logos3 className="py-12" heading="Trusted by teams at" />
        <Feature72 className="pt-8 pb-16" />
        <Testimonial4 className="pt-0" />
        <AISection />
        <Migration />
        <CoreCapabilities />
        <SelfHosted />
        <Mobile />
        <Integrations />
        <Enterprise />
        <Developers />
        <Cta />
      </main>

      <Footer />
    </Providers>
  );
}
