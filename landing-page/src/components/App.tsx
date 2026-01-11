import { Providers } from "@/components/Providers";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import {
  Hero,
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
