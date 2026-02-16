import { Providers } from "@/components/Providers";
import { useTranslation } from "@/contexts/LanguageContext";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  FileText,
  Scale,
  UserCheck,
  Shield,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Calendar,
  type LucideIcon,
} from "lucide-react";

interface ProhibitedItem {
  text: string;
  severity: string;
}

interface ContactInfo {
  email: string;
  address: string;
  response: string;
}

interface TermsSection {
  id: string;
  title: string;
  icon: string;
  content: string[];
  list?: string[];
  prohibited?: ProhibitedItem[];
  extra?: string;
  contact?: ContactInfo;
}

const iconMap: Record<string, LucideIcon> = {
  FileText,
  Scale,
  UserCheck,
  Shield,
  AlertCircle,
  Calendar,
};

export default function TermsPageNew() {
  const { t } = useTranslation();
  const { terms } = t;

  return (
    <Providers>
      <div className="min-h-screen bg-background">
        <Header />

        {/* Hero Section */}
        <section className="relative border-b border-border/40 bg-gradient-to-b from-background via-background/95 to-muted/20">
          <div className="container mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-8 py-20">
            <div className="max-w-4xl mx-auto">
              <Badge className="mb-4" variant="outline">
                <Scale className="mr-1 h-3 w-3" />
                {terms.hero.badge}
              </Badge>
              <h1 className="text-4xl font-bold tracking-tight sm:text-5xl mb-4">
                {terms.hero.title}
              </h1>
              <p className="text-lg text-muted-foreground mb-2">
                {terms.hero.description}
              </p>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="h-4 w-4" />
                <span>Last updated: {terms.lastUpdated}</span>
              </div>
            </div>
          </div>
        </section>

        {/* Table of Contents */}
        <section className="border-b border-border/40 bg-muted/30">
          <div className="container mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-8 py-8">
            <div className="max-w-4xl mx-auto">
              <h2 className="text-sm font-semibold text-muted-foreground mb-4">
                {terms.tableOfContents.title}
              </h2>
              <div className="grid sm:grid-cols-2 gap-2">
                {terms.sections.map((section: TermsSection, index: number) => (
                  <a
                    key={section.id}
                    href={`#${section.id}`}
                    className="flex items-center gap-2 text-sm hover:text-primary transition-colors py-1"
                  >
                    <span className="text-muted-foreground">{index + 1}.</span>
                    <span>{section.title}</span>
                  </a>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Main Content */}
        <section className="py-16">
          <div className="container mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-4xl mx-auto space-y-12">
              {terms.sections.map((section: TermsSection, index: number) => {
                const Icon = iconMap[section.icon];
                return (
                  <Card
                    key={section.id}
                    id={section.id}
                    className="scroll-mt-20"
                  >
                    <CardHeader>
                      <div className="flex items-start gap-4">
                        <div className="p-3 rounded-lg bg-primary/10">
                          <Icon className="h-6 w-6 text-primary" />
                        </div>
                        <div className="flex-1">
                          <div className="text-sm text-muted-foreground mb-1">
                            Section {index + 1}
                          </div>
                          <CardTitle className="text-2xl">
                            {section.title}
                          </CardTitle>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {section.content.map((paragraph: string, idx: number) => (
                        <p
                          key={idx}
                          className="text-muted-foreground leading-relaxed"
                        >
                          {paragraph}
                        </p>
                      ))}

                      {section.list && (
                        <ul className="space-y-2 ml-4">
                          {section.list.map((item: string, idx: number) => (
                            <li key={idx} className="flex items-start gap-2">
                              <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                              <span className="text-muted-foreground">
                                {item}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}

                      {section.prohibited && (
                        <ul className="space-y-2">
                          {section.prohibited.map(
                            (item: ProhibitedItem, idx: number) => (
                              <li
                                key={idx}
                                className="flex items-start gap-3 p-3 rounded-lg bg-muted/50"
                              >
                                <XCircle
                                  className={`h-5 w-5 mt-0.5 flex-shrink-0 ${
                                    item.severity === "high"
                                      ? "text-destructive"
                                      : "text-orange-500"
                                  }`}
                                />
                                <span className="text-muted-foreground">
                                  {item.text}
                                </span>
                                <Badge
                                  variant={
                                    item.severity === "high"
                                      ? "destructive"
                                      : "secondary"
                                  }
                                  className="ml-auto"
                                >
                                  {item.severity}
                                </Badge>
                              </li>
                            ),
                          )}
                        </ul>
                      )}

                      {section.extra && (
                        <div className="mt-4 p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
                          <p className="text-sm text-muted-foreground">
                            {section.extra}
                          </p>
                        </div>
                      )}

                      {section.contact && (
                        <div className="mt-4 p-6 rounded-lg bg-muted/50 space-y-3">
                          <div className="flex items-center gap-2">
                            <strong className="text-foreground">Email:</strong>
                            <a
                              href={`mailto:${section.contact.email}`}
                              className="text-primary hover:underline"
                            >
                              {section.contact.email}
                            </a>
                          </div>
                          <div>
                            <strong className="text-foreground">Mail:</strong>
                            <p className="text-muted-foreground mt-1">
                              {section.contact.address}
                            </p>
                          </div>
                          <p className="text-sm text-muted-foreground italic">
                            {section.contact.response}
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>

        {/* Bottom CTA */}
        <section className="py-16 border-t border-border/40 bg-muted/30">
          <div className="container mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-4xl mx-auto text-center">
              <h2 className="text-2xl font-bold mb-4">
                {terms.bottomCta.title}
              </h2>
              <p className="text-muted-foreground mb-6">
                {terms.bottomCta.description}
              </p>
              <div className="flex flex-wrap gap-4 justify-center">
                <a
                  href="mailto:legal@taskforce.app"
                  className="inline-flex items-center justify-center rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90"
                >
                  {terms.bottomCta.buttons.contact}
                </a>
                <a
                  href="/privacy-policy"
                  className="inline-flex items-center justify-center rounded-md border border-input bg-background px-6 py-3 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                  {terms.bottomCta.buttons.privacy}
                </a>
              </div>
            </div>
          </div>
        </section>

        <Footer />
      </div>
    </Providers>
  );
}
