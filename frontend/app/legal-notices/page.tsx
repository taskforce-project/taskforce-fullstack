import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { DesktopLegal } from "@/components/legal/desktop-legal"
import { SelfHostedLegal, isSelfHosted } from "@/components/legal/self-hosted-legal"
import { IS_DESKTOP } from "@/lib/desktop"

export const metadata = {
  title: "Legal Notices - TaskForce",
  description: "Terms of service, acceptable use, and legal information for TaskForce.",
}

export default function LegalNoticesPage() {
  // App desktop : l'éditeur du logiciel, et le compte en ligne sous les conditions du service web.
  if (IS_DESKTOP) return <DesktopLegal kind="legal" />
  // Instance auto-hébergée : son administrateur en répond, pas l'éditeur du service hébergé.
  if (isSelfHosted()) return <SelfHostedLegal kind="legal" />
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
              TaskForce is published by Pierre Michel (individual publisher; sole-proprietor
              registration in progress), who is also the director of publication. For any legal
              inquiry, contact{" "}
              <a href="mailto:contact@taskforce-project.fr" className="text-foreground underline underline-offset-2">
                contact@taskforce-project.fr
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
              TaskForce is open-source project management software (AGPL-3.0) providing issue tracking, cycles, team collaboration, document pages, and AI-assisted features. This instance is provided &ldquo;as is&rdquo;, free of charge, with no uptime guarantee.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">4. Account responsibilities</h2>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>You are responsible for maintaining the confidentiality of your credentials.</li>
              <li>You must not share your account with third parties.</li>
              <li>You must notify us immediately of any unauthorized access at{" "}
                <a href="mailto:contact@taskforce-project.fr" className="text-foreground underline underline-offset-2">
                  contact@taskforce-project.fr
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
              TaskForce is free software: its source code is published under the GNU Affero General Public License v3.0 (AGPL-3.0). The TaskForce name and logo are not covered by that license. You retain all rights to the content (issues, pages, documents) you create within your workspace. By using the platform, you grant TaskForce a limited, non-exclusive license to store and display your content solely to provide the service.
            </p>
            <p className="mt-3">
              The painting on the sign-in pages comes from the collection of the Art Institute of Chicago, which{" "}
              <a href="https://unsplash.com/photos/AckZaYtIq3I" className="text-foreground underline underline-offset-2">
                publishes it on Unsplash
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">7. Limitation of liability</h2>
            <p>
              To the maximum extent permitted by law, TaskForce shall not be liable for indirect, incidental, or consequential damages arising from use of the service, including loss of data, revenue, or business opportunities. Our total liability shall not exceed the amount paid by you in the 12 months preceding the claim.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">8. Governing law</h2>
            <p>
              These terms are governed by French law. Any dispute shall be subject to the exclusive jurisdiction of the courts of Paris, France.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">9. Contact</h2>
            <p>
              For any legal or compliance question:{" "}
              <a href="mailto:contact@taskforce-project.fr" className="text-foreground underline underline-offset-2">
                contact@taskforce-project.fr
              </a>
              .
            </p>
          </section>

        </div>
      </div>
    </div>
  )
}
