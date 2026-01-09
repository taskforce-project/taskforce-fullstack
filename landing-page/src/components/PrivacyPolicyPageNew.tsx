import { Providers } from "@/components/Providers";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Shield,
  Lock,
  Eye,
  Database,
  Globe,
  UserCheck,
  FileCheck,
  Cookie,
  Mail,
  Calendar,
  Download,
  Trash2,
  CheckCircle2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useTranslation } from "../contexts/LanguageContext";

// Icon mapping to convert string names to components
const iconMap: Record<string, LucideIcon> = {
  Shield,
  Lock,
  Eye,
  Database,
  Globe,
  UserCheck,
  FileCheck,
  Cookie,
  Mail,
  Calendar,
  Download,
  Trash2,
  CheckCircle2,
};

export default function PrivacyPolicyPageNew() {
  const { t } = useTranslation();
  const { privacy } = t;

  return (
    <Providers>
      <div className="min-h-screen bg-background">
        <Header />

        {/* Hero Section */}
        <section className="relative border-b border-border/40 bg-gradient-to-b from-background via-background/95 to-muted/20">
          <div className="container mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-8 py-20">
            <div className="max-w-4xl mx-auto">
              <Badge className="mb-4" variant="outline">
                <Shield className="mr-1 h-3 w-3" />
                {privacy.hero.badge}
              </Badge>
              <h1 className="text-4xl font-bold tracking-tight sm:text-5xl mb-4">
                {privacy.hero.title}
              </h1>
              <p className="text-lg text-muted-foreground mb-2">
                {privacy.hero.description}
              </p>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="h-4 w-4" />
                <span>Last updated: {privacy.lastUpdated}</span>
              </div>
            </div>
          </div>
        </section>

        {/* Key Commitments */}
        <section className="py-12 border-b border-border/40 bg-muted/30">
          <div className="container mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-4xl mx-auto">
              <h2 className="text-xl font-semibold mb-6 text-center">
                {privacy.commitments.title}
              </h2>
              <div className="grid md:grid-cols-3 gap-4">
                {privacy.commitments.items.map((commitment) => {
                  const Icon = iconMap[commitment.icon];
                  return (
                    <div
                      key={commitment.title}
                      className="flex items-start gap-3 p-4 rounded-lg bg-background border border-border"
                    >
                      <Icon className="h-5 w-5 text-primary mt-0.5" />
                      <div>
                        <h3 className="font-medium mb-1">{commitment.title}</h3>
                        <p className="text-sm text-muted-foreground">
                          {commitment.description}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* Table of Contents */}
        <section className="border-b border-border/40 bg-background">
          <div className="container mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-8 py-8">
            <div className="max-w-4xl mx-auto">
              <h2 className="text-sm font-semibold text-muted-foreground mb-4">
                {privacy.tableOfContents.title}
              </h2>
              <div className="grid sm:grid-cols-2 gap-2">
                {privacy.sections.map((section, index) => (
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
              {privacy.sections.map((section, index) => {
                const SectionIcon = iconMap[section.icon];
                return (
                  <Card
                    key={section.id}
                    id={section.id}
                    className="scroll-mt-20"
                  >
                    <CardHeader>
                      <div className="flex items-start gap-4">
                        <div className="p-3 rounded-lg bg-primary/10">
                          <SectionIcon className="h-6 w-6 text-primary" />
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
                    <CardContent className="space-y-6">
                      {section.content?.map((paragraph, idx) => (
                        <p
                          key={idx}
                          className="text-muted-foreground leading-relaxed"
                        >
                          {paragraph}
                        </p>
                      ))}

                      {/* Subsections for Information We Collect */}
                      {section.subsections?.map((subsection) => (
                        <div key={subsection.title} className="space-y-3">
                          <h3 className="text-lg font-semibold">
                            {subsection.title}
                          </h3>
                          <div className="grid gap-3">
                            {subsection.items.map((item) => (
                              <div
                                key={item.label}
                                className="flex items-start gap-3 p-3 rounded-lg bg-muted/50"
                              >
                                <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                                <div>
                                  <div className="font-medium">
                                    {item.label}
                                  </div>
                                  <div className="text-sm text-muted-foreground">
                                    {item.description}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}

                      {/* Purposes */}
                      {section.purposes && (
                        <div className="grid gap-4">
                          {section.purposes.map((purpose) => (
                            <div
                              key={purpose.title}
                              className="flex items-start gap-3 p-4 rounded-lg border border-border bg-background"
                            >
                              <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                              <div>
                                <h4 className="font-semibold mb-1">
                                  {purpose.title}
                                </h4>
                                <p className="text-sm text-muted-foreground">
                                  {purpose.description}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Security Measures */}
                      {section.security && (
                        <div className="grid md:grid-cols-2 gap-4">
                          {section.security.map((measure) => {
                            const Icon = iconMap[measure.icon];
                            return (
                              <div
                                key={measure.measure}
                                className="p-4 rounded-lg border border-border bg-gradient-to-br from-background to-muted/20"
                              >
                                <div className="flex items-center gap-2 mb-2">
                                  <Icon className="h-5 w-5 text-primary" />
                                  <h4 className="font-semibold">
                                    {measure.measure}
                                  </h4>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                  {measure.description}
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Retention Periods */}
                      {section.retention && (
                        <div className="space-y-2">
                          {section.retention.map((item) => (
                            <div
                              key={item.type}
                              className="flex justify-between items-center p-3 rounded-lg bg-muted/50"
                            >
                              <span className="font-medium">{item.type}</span>
                              <Badge variant="secondary">{item.period}</Badge>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Rights (with icons) */}
                      {section.rights &&
                        Array.isArray(section.rights) &&
                        section.rights[0]?.right && (
                          <div className="grid md:grid-cols-2 gap-4">
                            {section.rights.map((right) => {
                              const Icon = iconMap[right.icon];
                              return (
                                <div
                                  key={right.right}
                                  className="flex items-start gap-3 p-4 rounded-lg border border-border"
                                >
                                  <div className="p-2 rounded-lg bg-primary/10">
                                    <Icon className="h-5 w-5 text-primary" />
                                  </div>
                                  <div>
                                    <h4 className="font-semibold mb-1">
                                      {right.right}
                                    </h4>
                                    <p className="text-sm text-muted-foreground">
                                      {right.description}
                                    </p>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}

                      {section.exercise && (
                        <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
                          <p className="text-sm text-muted-foreground">
                            {section.exercise}
                          </p>
                        </div>
                      )}

                      {/* Legal Bases */}
                      {section.bases && (
                        <div className="space-y-2">
                          {section.bases.map((basis) => (
                            <div
                              key={basis.basis}
                              className="flex items-start gap-3 p-3 rounded-lg bg-muted/50"
                            >
                              <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                              <div>
                                <span className="font-medium">
                                  {basis.basis}:
                                </span>{" "}
                                <span className="text-muted-foreground">
                                  {basis.example}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* CCPA Rights as plain text list */}
                      {section.rightsText && (
                        <ul className="space-y-2">
                          {section.rightsText.map((right, idx) => (
                            <li key={idx} className="flex items-start gap-2">
                              <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                              <span className="text-muted-foreground">
                                {right}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}

                      {/* Data Sharing */}
                      {section.sharing && (
                        <div className="space-y-4">
                          {section.sharing.map((share) => (
                            <div
                              key={share.category}
                              className="p-4 rounded-lg border border-border"
                            >
                              <h4 className="font-semibold mb-2">
                                {share.category}
                              </h4>
                              <p className="text-sm text-muted-foreground mb-2">
                                {share.description}
                              </p>
                              <Badge variant="outline" className="text-xs">
                                {share.examples}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Safeguards */}
                      {section.safeguards && (
                        <ul className="space-y-2">
                          {section.safeguards.map((safeguard, idx) => (
                            <li key={idx} className="flex items-start gap-2">
                              <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                              <span className="text-muted-foreground">
                                {safeguard}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}

                      {/* Cookie Types */}
                      {section.cookieTypes && (
                        <div className="grid gap-3">
                          {section.cookieTypes.map((cookie) => (
                            <div
                              key={cookie.type}
                              className="flex items-start justify-between p-4 rounded-lg border border-border"
                            >
                              <div className="flex-1">
                                <h4 className="font-semibold mb-1">
                                  {cookie.type}
                                </h4>
                                <p className="text-sm text-muted-foreground mb-2">
                                  {cookie.purpose}
                                </p>
                              </div>
                              <Badge variant="secondary" className="ml-4">
                                {cookie.control}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Notifications */}
                      {section.notifications && (
                        <ul className="space-y-2">
                          {section.notifications.map((notification, idx) => (
                            <li key={idx} className="flex items-start gap-2">
                              <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                              <span className="text-muted-foreground">
                                {notification}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}

                      {section.extra && (
                        <div className="p-4 rounded-lg bg-muted/50">
                          <p className="text-sm text-muted-foreground">
                            {section.extra}
                          </p>
                        </div>
                      )}

                      {/* Contact Information */}
                      {section.contact && (
                        <div className="p-6 rounded-lg bg-muted/50 space-y-3">
                          <div className="flex items-center gap-2">
                            <strong className="text-foreground">
                              General Inquiries:
                            </strong>
                            <a
                              href={`mailto:${section.contact.email}`}
                              className="text-primary hover:underline"
                            >
                              {section.contact.email}
                            </a>
                          </div>
                          <div className="flex items-center gap-2">
                            <strong className="text-foreground">
                              Data Protection Officer:
                            </strong>
                            <a
                              href={`mailto:${section.contact.dpo}`}
                              className="text-primary hover:underline"
                            >
                              {section.contact.dpo}
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
                {privacy.bottomCta.title}
              </h2>
              <p className="text-muted-foreground mb-6">
                {privacy.bottomCta.description}
              </p>
              <div className="flex flex-wrap gap-4 justify-center">
                <a
                  href="mailto:privacy@taskforce.app"
                  className="inline-flex items-center justify-center rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90"
                >
                  {privacy.bottomCta.buttons.contact}
                </a>
                <a
                  href="/terms"
                  className="inline-flex items-center justify-center rounded-md border border-input bg-background px-6 py-3 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                  {privacy.bottomCta.buttons.terms}
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
