import Link from "next/link"
import { ArrowLeft } from "lucide-react"

export const metadata = {
  title: "Privacy Policy - TaskForce",
  description: "How TaskForce collects, uses, and protects your personal data.",
}

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>

        <h1 className="text-3xl font-bold text-foreground mb-2">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground mb-10">Last updated: June 10, 2026</p>

        <div className="max-w-none space-y-8 text-muted-foreground text-sm leading-relaxed">

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">1. Data controller</h2>
            <p>
              TaskForce (&ldquo;we&rdquo;, &ldquo;us&rdquo;) is the data controller for all personal data processed
              through this platform. For any privacy-related inquiry, contact us at{" "}
              <a href="mailto:privacy@taskforce.dev" className="text-foreground underline underline-offset-2">
                privacy@taskforce.dev
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">2. Data we collect</h2>
            <ul className="list-disc pl-5 space-y-1.5">
              <li><strong className="text-foreground">Account data:</strong> first name, last name, email address, profile picture (optional).</li>
              <li><strong className="text-foreground">Usage data:</strong> workspace activity, issues created/updated, project membership.</li>
              <li><strong className="text-foreground">Authentication data:</strong> hashed credentials managed via Keycloak, JWT access and refresh tokens stored locally in your browser.</li>
              <li><strong className="text-foreground">Billing data:</strong> subscription plan, payment status. Card details are handled exclusively by Stripe and never stored on our servers.</li>
              <li><strong className="text-foreground">Integration data:</strong> OAuth tokens for GitHub and Slack, stored encrypted and used only to perform actions you explicitly authorize.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">3. Legal basis for processing</h2>
            <ul className="list-disc pl-5 space-y-1.5">
              <li><strong className="text-foreground">Contract performance</strong> (Art. 6(1)(b) GDPR) - processing necessary to provide the TaskForce service you signed up for.</li>
              <li><strong className="text-foreground">Legitimate interests</strong> (Art. 6(1)(f) GDPR) - security monitoring, fraud prevention, and service improvement.</li>
              <li><strong className="text-foreground">Legal obligation</strong> (Art. 6(1)(c) GDPR) - compliance with applicable law, including tax and financial regulations.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">4. Cookies and local storage</h2>
            <p>
              TaskForce uses <strong className="text-foreground">strictly necessary</strong> browser local storage entries to maintain your authenticated session (access token, refresh token). No advertising, analytics, or tracking cookies are set. No third-party trackers are embedded on this platform.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">5. Data sharing</h2>
            <p>We do not sell your personal data. We share data only with the following sub-processors:</p>
            <ul className="list-disc pl-5 space-y-1.5 mt-2">
              <li><strong className="text-foreground">Stripe</strong> - payment processing (EU data center).</li>
              <li><strong className="text-foreground">Mailtrap / transactional email provider</strong> - sending account and notification emails.</li>
              <li><strong className="text-foreground">MinIO</strong> - file attachment storage (self-hosted or configured cloud region).</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">6. Data retention</h2>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>Account data is retained for the duration of your subscription plus 30 days after account deletion.</li>
              <li>Billing records are retained for 10 years to comply with French accounting law.</li>
              <li>Workspace data (issues, projects, comments) is deleted within 30 days of a deletion request.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">7. Your rights (GDPR)</h2>
            <p>Under the GDPR you have the right to:</p>
            <ul className="list-disc pl-5 space-y-1.5 mt-2">
              <li><strong className="text-foreground">Access</strong> - obtain a copy of all personal data we hold about you.</li>
              <li><strong className="text-foreground">Rectification</strong> - correct inaccurate or incomplete data.</li>
              <li><strong className="text-foreground">Erasure</strong> - request deletion of your account and associated data.</li>
              <li><strong className="text-foreground">Portability</strong> - receive your data in a machine-readable format.</li>
              <li><strong className="text-foreground">Restriction</strong> - ask us to restrict processing of your data.</li>
              <li><strong className="text-foreground">Objection</strong> - object to processing based on legitimate interests.</li>
            </ul>
            <p className="mt-3">
              To exercise these rights, go to{" "}
              <strong className="text-foreground">Settings → Privacy & Data</strong> in the app, or email{" "}
              <a href="mailto:privacy@taskforce.dev" className="text-foreground underline underline-offset-2">
                privacy@taskforce.dev
              </a>
              . We respond within 30 days as required by law.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">8. Data security</h2>
            <p>
              We apply industry-standard security measures: HTTPS/TLS in transit, AES-256 encryption at rest, HTTP security headers (HSTS, CSP, X-Frame-Options), rate limiting on all authentication endpoints, and regular dependency vulnerability scanning.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">9. Complaints</h2>
            <p>
              If you believe we are processing your data unlawfully, you have the right to lodge a complaint with the French data protection authority (CNIL) at{" "}
              <a href="https://www.cnil.fr" target="_blank" rel="noopener noreferrer" className="text-foreground underline underline-offset-2">
                cnil.fr
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">10. Changes to this policy</h2>
            <p>
              We may update this policy to reflect changes in our practices or applicable law. We will notify you of material changes by email and update the date at the top of this page.
            </p>
          </section>

        </div>
      </div>
    </div>
  )
}
