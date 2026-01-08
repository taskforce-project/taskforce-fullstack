import { Providers } from "@/components/Providers";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

export default function PrivacyPolicyPageNew() {
  const lastUpdated = "January 7, 2026";

  const sections = [
    {
      id: "introduction",
      title: "Introduction",
      icon: Shield,
      content: [
        "At TaskForce, we take your privacy seriously. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our task management platform.",
        "We are committed to protecting your personal information and your right to privacy. If you have any questions or concerns about our policy or our practices with regards to your personal information, please contact us at privacy@taskforce.app.",
      ],
    },
    {
      id: "information-we-collect",
      title: "Information We Collect",
      icon: Database,
      subsections: [
        {
          title: "Personal Information",
          items: [
            { label: "Account Information", description: "Name, email address, username, and password" },
            { label: "Profile Data", description: "Profile picture, bio, preferences, and settings" },
            { label: "Billing Information", description: "Payment details processed securely through third-party providers (we don't store card numbers)" },
            { label: "Communication Data", description: "Information from your interactions with our support team" },
          ],
        },
        {
          title: "Usage Data",
          items: [
            { label: "Log Data", description: "IP address, browser type, device information, operating system" },
            { label: "Usage Patterns", description: "Features used, pages visited, time spent, and click patterns" },
            { label: "Task Data", description: "Tasks, projects, comments, and files you create or upload" },
            { label: "Analytics", description: "Performance metrics and error reports to improve our service" },
          ],
        },
        {
          title: "Cookies & Tracking",
          items: [
            { label: "Essential Cookies", description: "Required for authentication and security" },
            { label: "Functional Cookies", description: "Remember your preferences and settings" },
            { label: "Analytics Cookies", description: "Help us understand how you use TaskForce" },
            { label: "Marketing Cookies", description: "Used to provide relevant advertisements (with your consent)" },
          ],
        },
      ],
    },
    {
      id: "how-we-use",
      title: "How We Use Your Information",
      icon: Eye,
      purposes: [
        { title: "Provide & Maintain Service", description: "Process your tasks, enable collaboration, and deliver core functionality" },
        { title: "Improve User Experience", description: "Analyze usage patterns to enhance features and fix bugs" },
        { title: "Communication", description: "Send notifications, updates, and respond to your inquiries" },
        { title: "Security & Fraud Prevention", description: "Detect and prevent security threats and unauthorized access" },
        { title: "Legal Compliance", description: "Comply with applicable laws and regulations" },
        { title: "Marketing", description: "Send promotional emails (you can opt out anytime)" },
      ],
    },
    {
      id: "data-security",
      title: "Data Security",
      icon: Lock,
      security: [
        {
          measure: "Encryption in Transit",
          description: "All data transmitted between your device and our servers is encrypted using TLS 1.3",
          icon: Lock,
        },
        {
          measure: "Encryption at Rest",
          description: "All stored data is encrypted using AES-256 encryption",
          icon: Database,
        },
        {
          measure: "Access Controls",
          description: "Strict role-based access controls and multi-factor authentication for our team",
          icon: UserCheck,
        },
        {
          measure: "Regular Audits",
          description: "Security audits and penetration testing performed quarterly",
          icon: FileCheck,
        },
        {
          measure: "Secure Infrastructure",
          description: "Hosted on enterprise-grade cloud infrastructure with 99.9% uptime SLA",
          icon: Globe,
        },
        {
          measure: "Data Backups",
          description: "Automated daily backups with 30-day retention",
          icon: Download,
        },
      ],
    },
    {
      id: "data-retention",
      title: "Data Retention",
      icon: Calendar,
      content: [
        "We retain your personal information only for as long as necessary to fulfill the purposes outlined in this Privacy Policy, unless a longer retention period is required or permitted by law.",
      ],
      retention: [
        { type: "Active Accounts", period: "Duration of account + 90 days after deletion request" },
        { type: "Billing Records", period: "7 years (as required by law)" },
        { type: "Support Tickets", period: "3 years" },
        { type: "Analytics Data", period: "26 months" },
        { type: "Marketing Data", period: "Until you opt out + 30 days" },
      ],
    },
    {
      id: "your-rights",
      title: "Your Privacy Rights",
      icon: UserCheck,
      rights: [
        {
          right: "Access",
          description: "Request a copy of all personal data we hold about you",
          icon: Eye,
        },
        {
          right: "Correction",
          description: "Request correction of inaccurate or incomplete data",
          icon: FileCheck,
        },
        {
          right: "Deletion",
          description: "Request deletion of your personal data (right to be forgotten)",
          icon: Trash2,
        },
        {
          right: "Data Portability",
          description: "Request your data in a machine-readable format",
          icon: Download,
        },
        {
          right: "Objection",
          description: "Object to processing of your data for marketing purposes",
          icon: Shield,
        },
        {
          right: "Restriction",
          description: "Request restriction of processing in certain circumstances",
          icon: Lock,
        },
      ],
      exercise: "To exercise any of these rights, please contact us at privacy@taskforce.app. We will respond within 30 days.",
    },
    {
      id: "gdpr-compliance",
      title: "GDPR Compliance",
      icon: Globe,
      content: [
        "For users in the European Economic Area (EEA), we comply with the General Data Protection Regulation (GDPR). We process your data based on the following legal bases:",
      ],
      bases: [
        { basis: "Consent", example: "When you agree to marketing communications" },
        { basis: "Contract", example: "To provide the service you signed up for" },
        { basis: "Legal Obligation", example: "To comply with accounting and tax laws" },
        { basis: "Legitimate Interests", example: "To improve our service and prevent fraud" },
      ],
    },
    {
      id: "ccpa-compliance",
      title: "CCPA Compliance (California Residents)",
      icon: Shield,
      content: [
        "If you are a California resident, you have additional rights under the California Consumer Privacy Act (CCPA):",
      ],
      rights: [
        "Right to know what personal information is collected, used, shared, or sold",
        "Right to delete personal information",
        "Right to opt-out of the sale of personal information (we do not sell your data)",
        "Right to non-discrimination for exercising your CCPA rights",
      ],
    },
    {
      id: "data-sharing",
      title: "Data Sharing & Third Parties",
      icon: Globe,
      content: [
        "We do not sell your personal information. We may share your data with trusted third parties in the following situations:",
      ],
      sharing: [
        {
          category: "Service Providers",
          description: "Cloud hosting, payment processing, analytics, email delivery",
          examples: "AWS, Stripe, Google Analytics",
        },
        {
          category: "Business Transfers",
          description: "In case of merger, acquisition, or asset sale",
          examples: "Acquiring company with same privacy commitments",
        },
        {
          category: "Legal Requirements",
          description: "When required by law or to protect rights and safety",
          examples: "Court orders, legal proceedings, fraud investigation",
        },
        {
          category: "With Your Consent",
          description: "When you explicitly authorize sharing",
          examples: "Third-party integrations you enable",
        },
      ],
    },
    {
      id: "international-transfers",
      title: "International Data Transfers",
      icon: Globe,
      content: [
        "Your information may be transferred to and processed in countries other than your country of residence. These countries may have data protection laws that are different from the laws of your country.",
        "We ensure that such transfers comply with applicable data protection laws through:",
      ],
      safeguards: [
        "Standard Contractual Clauses (SCCs) approved by the European Commission",
        "Privacy Shield certification (where applicable)",
        "Adequacy decisions by relevant data protection authorities",
      ],
    },
    {
      id: "children-privacy",
      title: "Children's Privacy",
      icon: Shield,
      content: [
        "TaskForce is not intended for children under the age of 13. We do not knowingly collect personal information from children under 13. If you are a parent or guardian and believe your child has provided us with personal information, please contact us immediately.",
        "If we discover that we have collected personal information from a child under 13 without parental consent, we will delete that information as quickly as possible.",
      ],
    },
    {
      id: "cookies-policy",
      title: "Cookies Policy",
      icon: Cookie,
      content: [
        "We use cookies and similar tracking technologies to enhance your experience. You can control cookie settings in your browser. Note that disabling certain cookies may affect functionality.",
      ],
      cookieTypes: [
        {
          type: "Strictly Necessary",
          purpose: "Essential for authentication and security",
          control: "Cannot be disabled",
        },
        {
          type: "Functional",
          purpose: "Remember your preferences",
          control: "Can be disabled in settings",
        },
        {
          type: "Analytics",
          purpose: "Help us improve the service",
          control: "Can be disabled in settings",
        },
        {
          type: "Marketing",
          purpose: "Deliver relevant advertisements",
          control: "Requires consent",
        },
      ],
    },
    {
      id: "changes",
      title: "Changes to This Policy",
      icon: FileCheck,
      content: [
        "We may update this Privacy Policy from time to time. We will notify you of any material changes by:",
      ],
      notifications: [
        "Sending an email to the address associated with your account",
        "Displaying a prominent notice on our website",
        "Updating the 'Last updated' date at the top of this policy",
      ],
      extra: "Your continued use of the Service after such modifications constitutes acceptance of the updated Privacy Policy.",
    },
    {
      id: "contact",
      title: "Contact Us",
      icon: Mail,
      content: [
        "If you have questions, concerns, or requests regarding this Privacy Policy or our data practices, please contact us:",
      ],
      contact: {
        email: "privacy@taskforce.app",
        dpo: "dpo@taskforce.app",
        address: "TaskForce Data Protection Officer",
        response: "We aim to respond to all privacy inquiries within 30 days.",
      },
    },
  ];

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
              Privacy & Security
            </Badge>
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl mb-4">
              Privacy Policy
            </h1>
            <p className="text-lg text-muted-foreground mb-2">
              Your privacy is important to us. Learn how we protect and manage your data.
            </p>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="h-4 w-4" />
              <span>Last updated: {lastUpdated}</span>
            </div>
          </div>
        </div>
      </section>

      {/* Key Commitments */}
      <section className="py-12 border-b border-border/40 bg-muted/30">
        <div className="container mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-xl font-semibold mb-6 text-center">Our Privacy Commitments</h2>
            <div className="grid md:grid-cols-3 gap-4">
              <div className="flex items-start gap-3 p-4 rounded-lg bg-background border border-border">
                <Shield className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <h3 className="font-medium mb-1">We Don't Sell Your Data</h3>
                  <p className="text-sm text-muted-foreground">
                    Your personal information is never sold to third parties
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-4 rounded-lg bg-background border border-border">
                <Lock className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <h3 className="font-medium mb-1">Bank-Level Encryption</h3>
                  <p className="text-sm text-muted-foreground">
                    All data encrypted in transit and at rest with AES-256
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-4 rounded-lg bg-background border border-border">
                <UserCheck className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <h3 className="font-medium mb-1">You're In Control</h3>
                  <p className="text-sm text-muted-foreground">
                    Access, export, or delete your data anytime
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Table of Contents */}
      <section className="border-b border-border/40 bg-background">
        <div className="container mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-8 py-8">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-sm font-semibold text-muted-foreground mb-4">
              TABLE OF CONTENTS
            </h2>
            <div className="grid sm:grid-cols-2 gap-2">
              {sections.map((section, index) => (
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
            {sections.map((section, index) => (
              <Card key={section.id} id={section.id} className="scroll-mt-20">
                <CardHeader>
                  <div className="flex items-start gap-4">
                    <div className="p-3 rounded-lg bg-primary/10">
                      <section.icon className="h-6 w-6 text-primary" />
                    </div>
                    <div className="flex-1">
                      <div className="text-sm text-muted-foreground mb-1">
                        Section {index + 1}
                      </div>
                      <CardTitle className="text-2xl">{section.title}</CardTitle>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  {section.content?.map((paragraph, idx) => (
                    <p key={idx} className="text-muted-foreground leading-relaxed">
                      {paragraph}
                    </p>
                  ))}

                  {/* Subsections for Information We Collect */}
                  {section.subsections?.map((subsection) => (
                    <div key={subsection.title} className="space-y-3">
                      <h3 className="text-lg font-semibold">{subsection.title}</h3>
                      <div className="grid gap-3">
                        {subsection.items.map((item) => (
                          <div
                            key={item.label}
                            className="flex items-start gap-3 p-3 rounded-lg bg-muted/50"
                          >
                            <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                            <div>
                              <div className="font-medium">{item.label}</div>
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
                            <h4 className="font-semibold mb-1">{purpose.title}</h4>
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
                        const Icon = measure.icon;
                        return (
                          <div
                            key={measure.measure}
                            className="p-4 rounded-lg border border-border bg-gradient-to-br from-background to-muted/20"
                          >
                            <div className="flex items-center gap-2 mb-2">
                              <Icon className="h-5 w-5 text-primary" />
                              <h4 className="font-semibold">{measure.measure}</h4>
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

                  {/* Rights */}
                  {section.rights && Array.isArray(section.rights) && section.rights[0]?.right && (
                    <div className="grid md:grid-cols-2 gap-4">
                      {section.rights.map((right) => {
                        const Icon = right.icon;
                        return (
                          <div
                            key={right.right}
                            className="flex items-start gap-3 p-4 rounded-lg border border-border"
                          >
                            <div className="p-2 rounded-lg bg-primary/10">
                              <Icon className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                              <h4 className="font-semibold mb-1">{right.right}</h4>
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
                      <p className="text-sm text-muted-foreground">{section.exercise}</p>
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
                            <span className="font-medium">{basis.basis}:</span>{" "}
                            <span className="text-muted-foreground">{basis.example}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* CCPA Rights as plain list */}
                  {section.rights && typeof section.rights[0] === "string" && (
                    <ul className="space-y-2">
                      {section.rights.map((right, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                          <span className="text-muted-foreground">{right}</span>
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
                          <h4 className="font-semibold mb-2">{share.category}</h4>
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
                          <span className="text-muted-foreground">{safeguard}</span>
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
                            <h4 className="font-semibold mb-1">{cookie.type}</h4>
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
                          <span className="text-muted-foreground">{notification}</span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {section.extra && (
                    <div className="p-4 rounded-lg bg-muted/50">
                      <p className="text-sm text-muted-foreground">{section.extra}</p>
                    </div>
                  )}

                  {/* Contact Information */}
                  {section.contact && (
                    <div className="p-6 rounded-lg bg-muted/50 space-y-3">
                      <div className="flex items-center gap-2">
                        <strong className="text-foreground">General Inquiries:</strong>
                        <a
                          href={`mailto:${section.contact.email}`}
                          className="text-primary hover:underline"
                        >
                          {section.contact.email}
                        </a>
                      </div>
                      <div className="flex items-center gap-2">
                        <strong className="text-foreground">Data Protection Officer:</strong>
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
            ))}
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="py-16 border-t border-border/40 bg-muted/30">
        <div className="container mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-2xl font-bold mb-4">Privacy Questions?</h2>
            <p className="text-muted-foreground mb-6">
              Our privacy team is here to answer any questions you may have.
            </p>
            <div className="flex flex-wrap gap-4 justify-center">
              <a
                href="mailto:privacy@taskforce.app"
                className="inline-flex items-center justify-center rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90"
              >
                Contact Privacy Team
              </a>
              <a
                href="/terms"
                className="inline-flex items-center justify-center rounded-md border border-input bg-background px-6 py-3 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                View Terms of Service
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
