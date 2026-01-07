import { Providers } from "@/components/Providers";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import Container from "@/components/layout/Container";

export default function AccessibilityPage() {
  return (
    <Providers>
      <Header />
      
      <main className="py-20">
        <Container>
          <div className="max-w-4xl mx-auto prose prose-lg dark:prose-invert">
            <h1>Accessibility Statement</h1>
            <p className="text-muted-foreground">Last updated: January 7, 2026</p>

            <h2>Our Commitment</h2>
            <p>
              TaskForce is committed to ensuring digital accessibility for people with disabilities. 
              We are continually improving the user experience for everyone and applying the relevant 
              accessibility standards.
            </p>

            <h2>Conformance Status</h2>
            <p>
              We aim to conform with the Web Content Accessibility Guidelines (WCAG) 2.1 Level AA. 
              These guidelines explain how to make web content more accessible for people with 
              disabilities and user-friendly for everyone.
            </p>

            <h2>Accessibility Features</h2>
            <p>TaskForce includes the following accessibility features:</p>
            
            <h3>Visual Adjustments</h3>
            <ul>
              <li><strong>Font Size Control:</strong> Adjust text size from 80% to 150% of default</li>
              <li><strong>Letter Spacing:</strong> Customize spacing for improved readability</li>
              <li><strong>OpenDyslexic Font:</strong> Optional dyslexia-friendly font</li>
              <li><strong>High Contrast Mode:</strong> Enhanced contrast for better visibility</li>
              <li><strong>Dark/Light Theme:</strong> Choose your preferred color scheme</li>
            </ul>

            <h3>Color Blindness Support</h3>
            <ul>
              <li>Protanopia (red-blind) filter</li>
              <li>Deuteranopia (green-blind) filter</li>
              <li>Tritanopia (blue-blind) filter</li>
            </ul>

            <h3>Keyboard Navigation</h3>
            <p>
              All interactive elements can be accessed and operated using keyboard controls. 
              Use Tab to navigate, Enter/Space to activate, and Escape to close dialogs.
            </p>

            <h3>Screen Reader Compatibility</h3>
            <p>
              Our platform is designed to work with popular screen readers including:
            </p>
            <ul>
              <li>JAWS (Windows)</li>
              <li>NVDA (Windows)</li>
              <li>VoiceOver (macOS, iOS)</li>
              <li>TalkBack (Android)</li>
            </ul>

            <h2>Semantic HTML</h2>
            <p>
              We use proper HTML5 semantic elements and ARIA attributes to ensure content structure 
              is meaningful and navigable for assistive technologies.
            </p>

            <h2>Alternative Text</h2>
            <p>
              All images that convey meaning include descriptive alternative text. Decorative 
              images are properly marked to be ignored by screen readers.
            </p>

            <h2>Known Limitations</h2>
            <p>
              Despite our best efforts, some limitations may exist. We are actively working to 
              address these issues:
            </p>
            <ul>
              <li>Some third-party content may not be fully accessible</li>
              <li>Legacy features are being progressively enhanced</li>
              <li>Complex data visualizations may require alternative formats</li>
            </ul>

            <h2>Feedback and Contact</h2>
            <p>
              We welcome your feedback on the accessibility of TaskForce. Please let us know if 
              you encounter accessibility barriers:
            </p>
            <ul>
              <li>Email: accessibility@taskforce.app</li>
              <li>Phone: +1 (555) 123-4567</li>
            </ul>
            <p>
              We try to respond to accessibility feedback within 2 business days.
            </p>

            <h2>Technical Specifications</h2>
            <p>
              Accessibility of TaskForce relies on the following technologies to work with your 
              web browser and assistive technologies:
            </p>
            <ul>
              <li>HTML5</li>
              <li>WAI-ARIA</li>
              <li>CSS3</li>
              <li>JavaScript</li>
            </ul>

            <h2>Assessment Approach</h2>
            <p>
              TaskForce assessed the accessibility of this website using the following approaches:
            </p>
            <ul>
              <li>Self-evaluation</li>
              <li>External evaluation by accessibility experts</li>
              <li>Automated testing tools (Lighthouse, axe DevTools)</li>
              <li>Manual testing with screen readers</li>
              <li>Keyboard-only navigation testing</li>
              <li>User testing with people with disabilities</li>
            </ul>

            <h2>Formal Complaints</h2>
            <p>
              If you are not satisfied with our response to your accessibility concern, you may 
              file a formal complaint with:
            </p>
            <ul>
              <li>Our customer service team at support@taskforce.app</li>
              <li>The relevant accessibility authority in your jurisdiction</li>
            </ul>

            <h2>Continuous Improvement</h2>
            <p>
              Accessibility is an ongoing commitment. We regularly:
            </p>
            <ul>
              <li>Conduct accessibility audits</li>
              <li>Provide training to our development team</li>
              <li>Update our accessibility features based on user feedback</li>
              <li>Monitor emerging accessibility standards and best practices</li>
            </ul>
          </div>
        </Container>
      </main>

      <Footer />
    </Providers>
  );
}
