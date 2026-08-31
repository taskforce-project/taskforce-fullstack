import Link from "next/link"
import { ArrowLeft } from "lucide-react"

export const metadata = {
  title: "Legal Notices - TaskForce",
  description: "Terms of service, acceptable use, and legal information for TaskForce.",
}

export default function LegalNoticesPage() {
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

        <h1 className="text-3xl font-bold text-foreground mb-2">Legal Notices & Terms of Service</h1>
        <p className="text-sm text-muted-foreground mb-10">Last updated: June 10, 2026</p>

        <div className="prose prose-sm dark:prose-invert max-w-none space-y-8 text-muted-foreground">

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">1. Publisher</h2>
            <p>
              TaskForce is published and operated by its founders. For any legal inquiry, contact{" "}
              <a href="mailto:legal@taskforce.dev" className="text-foreground underline underline-offset-2">
                legal@taskforce.dev
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">2. Acceptance of terms</h2>
            <p>
              By creating an account or using the TaskForce platform, you agree to these terms. If you do not agree, you must not use the service. We may update these terms; continued use after changes constitutes acceptance.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">3. Description of service</h2>
            <p>
              TaskForce is a project management SaaS platform providing issue tracking, sprint cycles, team collaboration, document pages, and AI-assisted features. Service is provided &ldquo;as is&rdquo; with no uptime guarantee under the free plan. Pro and Enterprise plans are subject to a separate SLA.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">4. Account responsibilities</h2>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>You are responsible for maintaining the confidentiality of your credentials.</li>
              <li>You must not share your account with third parties.</li>
              <li>You must notify us immediately of any unauthorized access at{" "}
                <a href="mailto:security@taskforce.dev" className="text-foreground underline underline-offset-2">
                  security@taskforce.dev
                </a>.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">5. Acceptable use</h2>
            <p>You agree not to:</p>
            <ul className="list-disc pl-5 space-y-1.5 mt-2">
              <li>Use the platform for illegal activities or to distribute unlawful content.</li>
              <li>Attempt to reverse-engineer, scrape, or probe the infrastructure.</li>
              <li>Transmit malware, spam, or abusive content.</li>
              <li>Circumvent authentication, rate limits, or access controls.</li>
            </ul>
            <p className="mt-3">
              Violations may result in immediate account suspension without refund.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">6. Intellectual property</h2>
            <p>
              The TaskForce platform, its design, and its source code are proprietary. You retain all rights to the content (issues, pages, documents) you create within your workspace. By using the platform, you grant TaskForce a limited, non-exclusive license to store and display your content solely to provide the service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">7. Billing and subscriptions</h2>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>Subscriptions are billed monthly or annually via Stripe.</li>
              <li>Prices are displayed inclusive of applicable taxes.</li>
              <li>You may cancel at any time; access continues until the end of the billing period.</li>
              <li>Refunds are not issued for partial billing periods unless required by applicable law.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">8. Limitation of liability</h2>
            <p>
              To the maximum extent permitted by law, TaskForce shall not be liable for indirect, incidental, or consequential damages arising from use of the service, including loss of data, revenue, or business opportunities. Our total liability shall not exceed the amount paid by you in the 12 months preceding the claim.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">9. Governing law</h2>
            <p>
              These terms are governed by French law. Any dispute shall be subject to the exclusive jurisdiction of the courts of Paris, France.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">10. Contact</h2>
            <p>
              For any legal or compliance question:{" "}
              <a href="mailto:legal@taskforce.dev" className="text-foreground underline underline-offset-2">
                legal@taskforce.dev
              </a>
              .
            </p>
          </section>

        </div>
      </div>
    </div>
  )
}
