import { Providers } from "@/components/Providers";
import { Header, Footer } from "@/components/layout/";
import {
  Hero,
  AIAgents,
  Testimonials,
  Features,
  ProFeatures,
  HowItWorks,
  Roadmap,
  Faq,
  Cta,
} from "@/components/sections/";
export default function App() {
  return (
    <Providers>
      <Header />

      <main>
        <Hero />
        <AIAgents />
        <Testimonials />
        <Features />
        <ProFeatures />
        <HowItWorks />
        <Roadmap />
        <Faq />
        <Cta />
      </main>

      <Footer />
    </Providers>
  );
}
