import { Providers } from "@/components/Providers";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import Container from "@/components/layout/Container";

export default function PrivacyPolicyPage() {
  return (
    <Providers>
      <Header />
      
      <main className="py-20">
        <Container>
          <div className="max-w-4xl mx-auto prose prose-lg dark:prose-invert">
            <h1>Privacy Policy</h1>
            <p className="text-muted-foreground">Last updated: January 7, 2026</p>

            <h2>Introduction</h2>
            <p>
              At TaskForce, we take your privacy seriously. This Privacy Policy explains how we
              collect, use, disclose, and safeguard your information when you use our service.
            </p>

            <h2>Information We Collect</h2>
            
            <h3>Personal Information</h3>
            <p>We may collect personal information that you provide to us, including:</p>
            <ul>
              <li>Name and email address</li>
              <li>Account credentials</li>
              <li>Profile information</li>
              <li>Payment information (processed securely by third-party providers)</li>
            </ul>

            <h3>Usage Data</h3>
            <p>We automatically collect certain information when you use our service:</p>
            <ul>
              <li>IP address and browser type</li>
              <li>Device information</li>
              <li>Usage patterns and preferences</li>
              <li>Cookies and similar tracking technologies</li>
            </ul>

            <h2>How We Use Your Information</h2>
            <p>We use the collected information to:</p>
            <ul>
              <li>Provide and maintain our service</li>
              <li>Improve user experience</li>
              <li>Send administrative information</li>
              <li>Respond to inquiries and support requests</li>
              <li>Monitor and analyze usage patterns</li>
            </ul>

            <h2>Data Security</h2>
            <p>
              We implement appropriate technical and organizational measures to protect your
              personal information against unauthorized access, alteration, disclosure, or
              destruction.
            </p>

            <h2>Data Retention</h2>
            <p>
              We retain your personal information only for as long as necessary to fulfill the
              purposes outlined in this Privacy Policy, unless a longer retention period is
              required by law.
            </p>

            <h2>Your Rights</h2>
            <p>You have the right to:</p>
            <ul>
              <li>Access your personal information</li>
              <li>Correct inaccurate data</li>
              <li>Request deletion of your data</li>
              <li>Object to processing of your data</li>
              <li>Data portability</li>
            </ul>

            <h2>GDPR Compliance</h2>
            <p>
              If you are located in the European Economic Area (EEA), we comply with the General
              Data Protection Regulation (GDPR). You have additional rights under GDPR, including
              the right to lodge a complaint with a supervisory authority.
            </p>

            <h2>Children's Privacy</h2>
            <p>
              Our service is not intended for children under 13. We do not knowingly collect
              personal information from children under 13.
            </p>

            <h2>Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. We will notify you of any
              changes by posting the new policy on this page and updating the "Last updated" date.
            </p>

            <h2>Contact Us</h2>
            <p>
              If you have questions about this Privacy Policy, please contact us at{" "}
              <a href="mailto:privacy@taskforce.app">privacy@taskforce.app</a>
            </p>
          </div>
        </Container>
      </main>

      <Footer />
    </Providers>
  );
}
