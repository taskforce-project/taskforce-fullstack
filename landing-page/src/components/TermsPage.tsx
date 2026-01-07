import { Providers } from "@/components/Providers";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import Container from "@/components/layout/Container";

export default function TermsPage() {
  return (
    <Providers>
      <Header />
      
      <main className="py-20">
        <Container>
          <div className="max-w-4xl mx-auto prose prose-lg dark:prose-invert">
            <h1>Terms of Service</h1>
            <p className="text-muted-foreground">Last updated: January 7, 2026</p>

            <h2>Agreement to Terms</h2>
            <p>
              By accessing and using TaskForce, you agree to be bound by these Terms of Service
              and all applicable laws and regulations.
            </p>

            <h2>Use License</h2>
            <p>
              Permission is granted to temporarily access TaskForce for personal or commercial use.
              This is the grant of a license, not a transfer of title.
            </p>

            <h2>User Accounts</h2>
            <p>
              When you create an account, you must provide accurate and complete information. You
              are responsible for maintaining the confidentiality of your account credentials.
            </p>

            <h2>Acceptable Use</h2>
            <p>You agree not to:</p>
            <ul>
              <li>Use the service for any unlawful purpose</li>
              <li>Attempt to gain unauthorized access to any part of the service</li>
              <li>Interfere with or disrupt the service or servers</li>
              <li>Upload malicious code or content</li>
              <li>Harass or harm other users</li>
              <li>Violate any applicable laws or regulations</li>
            </ul>

            <h2>Intellectual Property</h2>
            <p>
              The service and its original content, features, and functionality are owned by
              TaskForce and are protected by international copyright, trademark, and other
              intellectual property laws.
            </p>

            <h2>User Content</h2>
            <p>
              You retain all rights to the content you submit to TaskForce. By submitting content,
              you grant us a license to use, modify, and display that content as necessary to
              provide the service.
            </p>

            <h2>Termination</h2>
            <p>
              We may terminate or suspend your account and access to the service immediately,
              without prior notice, for any breach of these Terms of Service.
            </p>

            <h2>Limitation of Liability</h2>
            <p>
              TaskForce shall not be liable for any indirect, incidental, special, consequential,
              or punitive damages resulting from your use of the service.
            </p>

            <h2>Disclaimer</h2>
            <p>
              The service is provided "as is" without warranties of any kind, either express or
              implied, including but not limited to warranties of merchantability or fitness for a
              particular purpose.
            </p>

            <h2>Changes to Terms</h2>
            <p>
              We reserve the right to modify these terms at any time. We will notify users of any
              material changes by posting the new Terms of Service on this page.
            </p>

            <h2>Governing Law</h2>
            <p>
              These Terms shall be governed by and construed in accordance with the laws of the
              jurisdiction in which TaskForce operates.
            </p>

            <h2>Contact</h2>
            <p>
              For questions about these Terms of Service, contact us at{" "}
              <a href="mailto:legal@taskforce.app">legal@taskforce.app</a>
            </p>
          </div>
        </Container>
      </main>

      <Footer />
    </Providers>
  );
}
