import { useState } from "react";
import { useTranslation } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Menu,
  BookOpen,
  FileText,
  Shield,
  Eye,
  ChevronRight,
  Github,
} from "lucide-react";
import LanguageSelector from "./LanguageSelector";
import ThemeSwitcher from "./ThemeSwitcher";
import AccessibilityDropdown from "./AccessibilityDropdown";
import VersionSelector from "./VersionSelector";

export default function MobileMenu() {
  const { t } = useTranslation();
  const { header } = t;
  const [open, setOpen] = useState(false);
  const [docsOpen, setDocsOpen] = useState(false);
  const [resourcesOpen, setResourcesOpen] = useState(false);

  const closeSheet = () => setOpen(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          aria-label="Toggle menu"
        >
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-80 p-0">
        <SheetHeader className="p-6 pb-4">
          <SheetTitle className="text-left">Navigation</SheetTitle>
          <SheetDescription className="text-left">
            Browse all sections and settings
          </SheetDescription>
        </SheetHeader>
        <Separator />
        <ScrollArea className="h-[calc(100vh-180px)]">
          <div className="flex flex-col gap-2 p-6">
            <a
              href="#features"
              onClick={closeSheet}
              className="flex items-center rounded-lg px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              {header.navigation.features}
            </a>
            <a
              href="#how-it-works"
              onClick={closeSheet}
              className="flex items-center rounded-lg px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              {header.navigation.howItWorks}
            </a>

            <Collapsible open={docsOpen} onOpenChange={setDocsOpen}>
              <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors [&[data-state=open]>svg]:rotate-90">
                {header.navigation.documentation}
                <ChevronRight className="h-4 w-4 transition-transform duration-200" />
              </CollapsibleTrigger>
              <CollapsibleContent className="ml-3 mt-2 flex flex-col gap-2 border-l pl-4">
                <a
                  href="/docs"
                  onClick={closeSheet}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  <BookOpen className="h-4 w-4" />
                  <div>
                    <div className="font-medium">Documentation</div>
                    <div className="text-xs text-muted-foreground">
                      Complete guides and API docs
                    </div>
                  </div>
                </a>
                <a
                  href="/docs#getting-started"
                  onClick={closeSheet}
                  className="flex items-center rounded-lg px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  Getting Started
                </a>
                <a
                  href="/docs#api"
                  onClick={closeSheet}
                  className="flex items-center rounded-lg px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  API Reference
                </a>
                <a
                  href="/docs#guides"
                  onClick={closeSheet}
                  className="flex items-center rounded-lg px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  Guides
                </a>
                <a
                  href="/docs#components"
                  onClick={closeSheet}
                  className="flex items-center rounded-lg px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  Components
                </a>
              </CollapsibleContent>
            </Collapsible>

            <a
              href="#roadmap"
              onClick={closeSheet}
              className="flex items-center rounded-lg px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              {header.navigation.roadmap}
            </a>

            <Collapsible open={resourcesOpen} onOpenChange={setResourcesOpen}>
              <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors [&[data-state=open]>svg]:rotate-90">
                {header.navigation.resources}
                <ChevronRight className="h-4 w-4 transition-transform duration-200" />
              </CollapsibleTrigger>
              <CollapsibleContent className="ml-3 mt-2 flex flex-col gap-2 border-l pl-4">
                <a
                  href="/terms"
                  onClick={closeSheet}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  <FileText className="h-4 w-4" />
                  Terms of Service
                </a>
                <a
                  href="/privacy-policy"
                  onClick={closeSheet}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  <Shield className="h-4 w-4" />
                  Privacy Policy
                </a>
                <a
                  href="/accessibility"
                  onClick={closeSheet}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  <Eye className="h-4 w-4" />
                  Accessibility
                </a>
                <a
                  href="#faq"
                  onClick={closeSheet}
                  className="flex items-center rounded-lg px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  FAQ
                </a>
              </CollapsibleContent>
            </Collapsible>
          </div>
        </ScrollArea>
        <Separator />
        <div className="p-6 space-y-3">
          <div className="flex items-center justify-center gap-2 pb-3">
            <Button variant="ghost" size="sm" asChild>
              <a
                href="https://github.com"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Github className="h-4 w-4" />
              </a>
            </Button>
            <VersionSelector />
            <ThemeSwitcher />
            <AccessibilityDropdown />
            <LanguageSelector />
          </div>
          <Separator />
          <Button variant="outline" className="w-full" asChild>
            <a href="/login">{header.buttons.login}</a>
          </Button>
          <Button className="w-full" asChild>
            <a href="/register">{header.buttons.register}</a>
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
