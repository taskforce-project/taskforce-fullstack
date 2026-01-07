import { Separator } from "@/components/ui/separator";

export default function Footer() {
  return (
    <footer className="w-full border-t border-border/40 bg-background">
      <div className="container mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8">
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center gap-2">
              <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2L2 7L12 12L22 7L12 2Z" fill="currentColor" className="text-primary" />
                <path d="M2 17L12 22L22 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M2 12L12 17L22 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="font-bold text-xl">TaskForce</span>
            </div>
            <p className="text-sm text-muted-foreground max-w-xs">
              A powerful task management platform built with modern technologies. Organize your work efficiently.
            </p>
            <div className="flex items-center gap-3">
              <a href="https://github.com" target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground transition-colors duration-200">
                <span className="sr-only">GitHub</span>
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                </svg>
              </a>
              <a href="#" className="text-muted-foreground hover:text-foreground transition-colors duration-200">
                <span className="sr-only">Twitter</span>
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                </svg>
              </a>
            </div>
          </div>

          <div>
            <h3 className="font-semibold mb-4">Product</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <a href="#features" className="text-muted-foreground hover:text-foreground transition-colors duration-200">
                  Features
                </a>
              </li>
              <li>
                <a href="/pricing" className="text-muted-foreground hover:text-foreground transition-colors duration-200">
                  Pricing
                </a>
              </li>
              <li>
                <a href="#roadmap" className="text-muted-foreground hover:text-foreground transition-colors duration-200">
                  Roadmap
                </a>
              </li>
              <li>
                <a href="#faq" className="text-muted-foreground hover:text-foreground transition-colors duration-200">
                  FAQ
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold mb-4">Resources</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <a href="/docs" className="text-muted-foreground hover:text-foreground transition-colors duration-200">
                  Documentation
                </a>
              </li>
              <li>
                <a href="https://github.com" target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground transition-colors duration-200">
                  GitHub
                </a>
              </li>
              <li>
                <a href="/sitemap" className="text-muted-foreground hover:text-foreground transition-colors duration-200">
                  Site Map
                </a>
              </li>
              <li>
                <a href="/contact" className="text-muted-foreground hover:text-foreground transition-colors duration-200">
                  Contact
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold mb-4">Legal & Accessibility</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <a href="/privacy-policy" className="text-muted-foreground hover:text-foreground transition-colors duration-200">
                  Privacy Policy
                </a>
              </li>
              <li>
                <a href="/terms" className="text-muted-foreground hover:text-foreground transition-colors duration-200">
                  Terms of Service
                </a>
              </li>
              <li>
                <a href="/cookies" className="text-muted-foreground hover:text-foreground transition-colors duration-200">
                  Cookie Policy
                </a>
              </li>
              <li>
                <a href="/accessibility" className="text-muted-foreground hover:text-foreground transition-colors duration-200">
                  Accessibility
                </a>
              </li>
            </ul>
          </div>
        </div>

        <Separator className="my-8" />

        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 text-sm text-muted-foreground">
          <p>© {new Date().getFullYear()} TaskForce. All rights reserved.</p>
          <div className="flex items-center gap-4">
            <a href="/legal-notices" className="hover:text-foreground transition-colors duration-200">
              Legal Notices
            </a>
            <span>·</span>
            <a href="/accessibility" className="hover:text-foreground transition-colors duration-200">
              Accessibility Statement
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
