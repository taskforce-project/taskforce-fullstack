import { Providers } from "@/components/Providers";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import Hero from "@/components/sections/Hero";
import ScrollingTestimonials from "@/components/sections/Testimonials";
import Features from "@/components/sections/Features";
import ProFeatures from "@/components/sections/ProFeatures";
import HowItWorks from "@/components/sections/HowItWorks";
import Roadmap from "@/components/sections/Roadmap";
import FAQ from "@/components/sections/FAQ";
import CTA from "@/components/sections/CTA";

export default function App() {
  return (
    <Providers>
      <Header />

      <main>
        <Hero />
        <ScrollingTestimonials />
        <Features />
        <ProFeatures />
        <HowItWorks />
        <Roadmap />
        <FAQ />
        <CTA />
      </main>

      <Footer />
    </Providers>
  );
}
