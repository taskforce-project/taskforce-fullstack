import { Providers } from "@/components/Providers";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  FileText,
  Scale,
  UserCheck,
  Shield,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Calendar,
} from "lucide-react";

export default function TermsPageNew() {
  const lastUpdated = "January 7, 2026";

  const sections = [
    {
      id: "agreement",
      title: "Agreement to Terms",
      icon: FileText,
      content: [
        "By accessing or using TaskForce ('the Service'), you agree to be bound by these Terms of Service ('Terms'). If you disagree with any part of the terms, you may not access the Service.",
        "We reserve the right to modify these Terms at any time. We will notify users of any material changes via email or through the Service. Your continued use of the Service after such modifications constitutes acceptance of the updated Terms.",
      ],
    },
    {
      id: "license",
      title: "Use License",
      icon: Scale,
      content: [
        "Permission is granted to use TaskForce for personal or commercial purposes, subject to the following restrictions:",
      ],
      list: [
        "You must not modify, copy, or reproduce the Service materials without authorization",
        "You must not use the Service for any illegal or unauthorized purpose",
        "You must not attempt to reverse engineer, decompile, or disassemble any software",
        "You must not remove any copyright, trademark, or proprietary notices",
        "You must not interfere with or disrupt the Service or servers",
      ],
    },
    {
      id: "accounts",
      title: "User Accounts",
      icon: UserCheck,
      content: [
        "When you create an account with us, you must provide accurate, complete, and current information. Failure to do so constitutes a breach of the Terms and may result in immediate termination of your account.",
      ],
      list: [
        "You are responsible for safeguarding your account password",
        "You are responsible for all activities that occur under your account",
        "You must notify us immediately of any unauthorized use or security breach",
        "You must not share your account credentials with others",
        "You must be at least 13 years old to create an account",
      ],
    },
    {
      id: "acceptable-use",
      title: "Acceptable Use Policy",
      icon: Shield,
      content: [
        "You agree not to use TaskForce in any way that:",
      ],
      prohibited: [
        { text: "Violates any applicable laws or regulations", severity: "high" },
        { text: "Infringes on intellectual property rights of others", severity: "high" },
        { text: "Transmits malicious code, viruses, or harmful content", severity: "high" },
        { text: "Harasses, abuses, threatens, or harms others", severity: "high" },
        { text: "Distributes spam or unsolicited messages", severity: "medium" },
        { text: "Interferes with or disrupts the Service or its infrastructure", severity: "high" },
        { text: "Attempts unauthorized access to other accounts or systems", severity: "high" },
        { text: "Collects or stores personal data of other users without consent", severity: "high" },
      ],
    },
    {
      id: "intellectual-property",
      title: "Intellectual Property",
      icon: FileText,
      content: [
        "The Service and its original content, features, and functionality are owned by TaskForce and are protected by international copyright, trademark, patent, trade secret, and other intellectual property laws.",
        "Our trademarks and trade dress may not be used in connection with any product or service without our prior written consent.",
      ],
    },
    {
      id: "user-content",
      title: "User Content & Data",
      icon: FileText,
      content: [
        "You retain all rights to any content you submit, post, or display on TaskForce ('User Content'). By posting User Content, you grant us a worldwide, non-exclusive, royalty-free license to use, modify, publicly perform, publicly display, reproduce, and distribute such content in connection with operating and providing the Service.",
        "You represent and warrant that:",
      ],
      list: [
        "You own or have the necessary rights to your User Content",
        "Your User Content does not violate any third-party rights",
        "Your User Content complies with these Terms and applicable laws",
      ],
    },
    {
      id: "termination",
      title: "Termination",
      icon: XCircle,
      content: [
        "We may terminate or suspend your account and access to the Service immediately, without prior notice or liability, for any reason, including but not limited to breach of these Terms.",
        "Upon termination, your right to use the Service will immediately cease. If you wish to terminate your account, you may simply discontinue using the Service or contact us to request account deletion.",
        "All provisions of the Terms which by their nature should survive termination shall survive, including but not limited to ownership provisions, warranty disclaimers, indemnity, and limitations of liability.",
      ],
    },
    {
      id: "liability",
      title: "Limitation of Liability",
      icon: AlertCircle,
      content: [
        "In no event shall TaskForce, nor its directors, employees, partners, agents, suppliers, or affiliates, be liable for any indirect, incidental, special, consequential, or punitive damages, including but not limited to loss of profits, data, use, goodwill, or other intangible losses, resulting from:",
      ],
      list: [
        "Your access to or use of (or inability to access or use) the Service",
        "Any conduct or content of any third party on the Service",
        "Any content obtained from the Service",
        "Unauthorized access, use, or alteration of your transmissions or content",
      ],
      extra: "Our total liability to you for all claims arising from or related to the Service shall not exceed the amount you paid us in the twelve (12) months prior to the claim, or $100, whichever is greater.",
    },
    {
      id: "disclaimer",
      title: "Disclaimer",
      icon: AlertCircle,
      content: [
        "Your use of the Service is at your sole risk. The Service is provided on an 'AS IS' and 'AS AVAILABLE' basis. We expressly disclaim all warranties of any kind, whether express or implied, including but not limited to the implied warranties of merchantability, fitness for a particular purpose, and non-infringement.",
        "We do not warrant that:",
      ],
      list: [
        "The Service will function uninterrupted, secure, or available at any particular time or location",
        "Any errors or defects will be corrected",
        "The Service is free of viruses or other harmful components",
        "The results of using the Service will meet your requirements",
      ],
    },
    {
      id: "changes",
      title: "Changes to Service",
      icon: Calendar,
      content: [
        "We reserve the right to withdraw or amend our Service, and any service or material we provide, in our sole discretion without notice. We will not be liable if for any reason all or any part of the Service is unavailable at any time or for any period.",
        "From time to time, we may restrict access to some parts of the Service, or the entire Service, to users, including registered users.",
      ],
    },
    {
      id: "governing-law",
      title: "Governing Law",
      icon: Scale,
      content: [
        "These Terms shall be governed and construed in accordance with the laws of the jurisdiction in which TaskForce is established, without regard to its conflict of law provisions.",
        "Our failure to enforce any right or provision of these Terms will not be considered a waiver of those rights. If any provision of these Terms is held to be invalid or unenforceable, the remaining provisions will remain in effect.",
      ],
    },
    {
      id: "contact",
      title: "Contact Us",
      icon: FileText,
      content: [
        "If you have any questions about these Terms, please contact us at:",
      ],
      contact: {
        email: "legal@taskforce.app",
        address: "TaskForce Legal Department",
        response: "We aim to respond to all inquiries within 48 hours.",
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
              <Scale className="mr-1 h-3 w-3" />
              Legal
            </Badge>
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl mb-4">
              Terms of Service
            </h1>
            <p className="text-lg text-muted-foreground mb-2">
              Please read these terms carefully before using TaskForce
            </p>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="h-4 w-4" />
              <span>Last updated: {lastUpdated}</span>
            </div>
          </div>
        </div>
      </section>

      {/* Table of Contents */}
      <section className="border-b border-border/40 bg-muted/30">
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
                <CardContent className="space-y-4">
                  {section.content.map((paragraph, idx) => (
                    <p key={idx} className="text-muted-foreground leading-relaxed">
                      {paragraph}
                    </p>
                  ))}

                  {section.list && (
                    <ul className="space-y-2 ml-4">
                      {section.list.map((item, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                          <span className="text-muted-foreground">{item}</span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {section.prohibited && (
                    <ul className="space-y-2">
                      {section.prohibited.map((item, idx) => (
                        <li key={idx} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                          <XCircle
                            className={`h-5 w-5 mt-0.5 flex-shrink-0 ${
                              item.severity === "high"
                                ? "text-destructive"
                                : "text-orange-500"
                            }`}
                          />
                          <span className="text-muted-foreground">{item.text}</span>
                          <Badge
                            variant={item.severity === "high" ? "destructive" : "secondary"}
                            className="ml-auto"
                          >
                            {item.severity}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  )}

                  {section.extra && (
                    <div className="mt-4 p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
                      <p className="text-sm text-muted-foreground">{section.extra}</p>
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
            ))}
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="py-16 border-t border-border/40 bg-muted/30">
        <div className="container mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-2xl font-bold mb-4">Questions about our Terms?</h2>
            <p className="text-muted-foreground mb-6">
              Our legal team is here to help clarify any concerns you may have.
            </p>
            <div className="flex flex-wrap gap-4 justify-center">
              <a
                href="mailto:legal@taskforce.app"
                className="inline-flex items-center justify-center rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90"
              >
                Contact Legal Team
              </a>
              <a
                href="/privacy-policy"
                className="inline-flex items-center justify-center rounded-md border border-input bg-background px-6 py-3 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                View Privacy Policy
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
