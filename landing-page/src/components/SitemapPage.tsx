import { Providers } from "@/components/Providers";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import Container from "@/components/layout/Container";

const pages = [
  { title: "Home", url: "/" },
  { title: "Features", url: "/#features" },
  { title: "How It Works", url: "/#how-it-works" },
  { title: "Roadmap", url: "/#roadmap" },
  { title: "FAQ", url: "/#faq" },
  { title: "Documentation", url: "/docs" },
  { title: "Pricing", url: "/pricing" },
  { title: "Contact", url: "/contact" },
  { title: "Privacy Policy", url: "/privacy-policy" },
  { title: "Terms of Service", url: "/terms" },
  { title: "Accessibility Statement", url: "/accessibility" },
  { title: "Sitemap", url: "/sitemap" },
];

export default function SitemapPage() {
  return (
    <Providers>
      <Header />
      
      <main className="py-20">
        <Container>
          <div className="max-w-4xl mx-auto">
            <h1 className="text-4xl font-bold mb-8">Sitemap</h1>
            <p className="text-lg text-muted-foreground mb-12">
              Browse all pages available on TaskForce website
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {pages.map((page) => (
                <a
                  key={page.url}
                  href={page.url}
                  className="block p-6 rounded-lg border border-border/50 bg-card hover:border-primary/50 hover:shadow-lg transition-all duration-200 group"
                >
                  <h2 className="text-xl font-semibold mb-2 group-hover:text-primary transition-colors">
                    {page.title}
                  </h2>
                  <span className="text-sm text-muted-foreground">{page.url}</span>
                </a>
              ))}
            </div>

            <div className="mt-16 p-8 rounded-lg border border-border/50 bg-muted/30">
              <h2 className="text-2xl font-bold mb-4">Need Help Finding Something?</h2>
              <p className="text-muted-foreground mb-4">
                Can't find what you're looking for? Try our search or contact our support team.
              </p>
              <div className="flex gap-4">
                <a
                  href="/#faq"
                  className="inline-flex items-center px-6 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
                >
                  View FAQ
                </a>
                <a
                  href="/contact"
                  className="inline-flex items-center px-6 py-2.5 rounded-lg border border-border bg-background font-medium hover:bg-accent transition-colors"
                >
                  Contact Us
                </a>
              </div>
            </div>
          </div>
        </Container>
      </main>

      <Footer />
    </Providers>
  );
}
