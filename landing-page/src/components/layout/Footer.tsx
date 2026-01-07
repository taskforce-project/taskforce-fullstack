import { Separator } from "@/components/ui/separator";
import { Layers, Github, Twitter } from "lucide-react";
import { useTranslation } from "@/contexts/LanguageContext";

export default function Footer() {
  const { t } = useTranslation();
  const { footer } = t;
  
  return (
    <footer className="w-full border-t border-border/40 bg-background">
      <div className="container mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8">
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center gap-2">
              <Layers className="h-6 w-6 text-primary" />
              <span className="font-bold text-xl">{footer.brandName}</span>
            </div>
            <p className="text-sm text-muted-foreground max-w-xs">
              {footer.description}
            </p>
            <div className="flex items-center gap-3">
              <a href="https://github.com" target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground transition-colors duration-200">
                <span className="sr-only">GitHub</span>
                <Github className="h-5 w-5" />
              </a>
              <a href="#" className="text-muted-foreground hover:text-foreground transition-colors duration-200">
                <span className="sr-only">Twitter</span>
                <Twitter className="h-5 w-5" />
              </a>
            </div>
          </div>

          <div>
            <h3 className="font-semibold mb-4">{footer.sections.product.title}</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <a href="#features" className="text-muted-foreground hover:text-foreground transition-colors duration-200">
                  {footer.sections.product.links.features}
                </a>
              </li>
              <li>
                <a href="/pricing" className="text-muted-foreground hover:text-foreground transition-colors duration-200">
                  {footer.sections.product.links.pricing}
                </a>
              </li>
              <li>
                <a href="#roadmap" className="text-muted-foreground hover:text-foreground transition-colors duration-200">
                  {footer.sections.product.links.roadmap}
                </a>
              </li>
              <li>
                <a href="#faq" className="text-muted-foreground hover:text-foreground transition-colors duration-200">
                  {footer.sections.product.links.faq}
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold mb-4">{footer.sections.resources.title}</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <a href="/docs" className="text-muted-foreground hover:text-foreground transition-colors duration-200">
                  {footer.sections.resources.links.documentation}
                </a>
              </li>
              <li>
                <a href="https://github.com" target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground transition-colors duration-200">
                  {footer.sections.resources.links.github}
                </a>
              </li>
              <li>
                <a href="/sitemap" className="text-muted-foreground hover:text-foreground transition-colors duration-200">
                  {footer.sections.resources.links.sitemap}
                </a>
              </li>
              <li>
                <a href="/contact" className="text-muted-foreground hover:text-foreground transition-colors duration-200">
                  {footer.sections.resources.links.contact}
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold mb-4">{footer.sections.legal.title}</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <a href="/privacy-policy" className="text-muted-foreground hover:text-foreground transition-colors duration-200">
                  {footer.sections.legal.links.privacy}
                </a>
              </li>
              <li>
                <a href="/terms" className="text-muted-foreground hover:text-foreground transition-colors duration-200">
                  {footer.sections.legal.links.terms}
                </a>
              </li>
              <li>
                <a href="/cookies" className="text-muted-foreground hover:text-foreground transition-colors duration-200">
                  {footer.sections.legal.links.cookies}
                </a>
              </li>
              <li>
                <a href="/accessibility" className="text-muted-foreground hover:text-foreground transition-colors duration-200">
                  {footer.sections.legal.links.accessibility}
                </a>
              </li>
            </ul>
          </div>
        </div>

        <Separator className="my-8" />

        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 text-sm text-muted-foreground">
          <p>© {new Date().getFullYear()} {footer.copyright}</p>
          <div className="flex items-center gap-4">
            <a href="/legal-notices" className="hover:text-foreground transition-colors duration-200">
              {footer.bottomLinks.legalNotices}
            </a>
            <span>·</span>
            <a href="/accessibility" className="hover:text-foreground transition-colors duration-200">
              {footer.bottomLinks.accessibilityStatement}
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
