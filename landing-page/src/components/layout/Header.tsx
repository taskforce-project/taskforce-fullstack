import { Button } from "@/components/ui/button";
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuList,
  NavigationMenuContent,
  NavigationMenuTrigger,
  NavigationMenuLink,
  navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu";
import { Layers, Github, BookOpen, FileText, Shield, Eye } from "lucide-react";
import { useTranslation } from "@/contexts/LanguageContext";
import LanguageSelector from "./LanguageSelector";
import ThemeSwitcher from "./ThemeSwitcher";
import AccessibilityDropdown from "./AccessibilityDropdown";
import VersionSelector from "./VersionSelector";
import { cn } from "@/lib/utils";

export default function Header() {
  const { t } = useTranslation();
  const { header } = t;

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-16 max-w-screen-2xl items-center px-4 sm:px-6 lg:px-8">
        <div className="mr-4 flex items-center gap-2">
          <a href="/" className="flex items-center gap-2 font-bold text-xl">
            <Layers className="h-6 w-6 text-primary" />
            <span className="bg-linear-to-r from-primary to-primary/70 bg-clip-text text-transparent">
              {header.brandName}
            </span>
          </a>
        </div>

        <NavigationMenu className="hidden md:flex">
          <NavigationMenuList>
            <NavigationMenuItem>
              <a
                href="#features"
                className="group inline-flex h-9 w-max items-center justify-center rounded-md bg-background px-4 py-2 text-sm font-medium transition-colors duration-200 hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus:outline-none disabled:pointer-events-none disabled:opacity-50"
              >
                {header.navigation.features}
              </a>
            </NavigationMenuItem>
            <NavigationMenuItem>
              <a
                href="#how-it-works"
                className="group inline-flex h-9 w-max items-center justify-center rounded-md bg-background px-4 py-2 text-sm font-medium transition-colors duration-200 hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus:outline-none disabled:pointer-events-none disabled:opacity-50"
              >
                {header.navigation.howItWorks}
              </a>
            </NavigationMenuItem>
            <NavigationMenuItem>
              <NavigationMenuTrigger>Documentation</NavigationMenuTrigger>
              <NavigationMenuContent>
                <ul className="grid w-[400px] gap-3 p-4 md:w-[500px] md:grid-cols-2 lg:w-[600px]">
                  <li className="row-span-3">
                    <NavigationMenuLink asChild>
                      <a
                        className="flex h-full w-full select-none flex-col justify-end rounded-md bg-gradient-to-b from-muted/50 to-muted p-6 no-underline outline-none focus:shadow-md"
                        href="/docs"
                      >
                        <BookOpen className="h-6 w-6" />
                        <div className="mb-2 mt-4 text-lg font-medium">
                          Documentation
                        </div>
                        <p className="text-sm leading-tight text-muted-foreground">
                          Learn how to use TaskForce with our comprehensive guides and API documentation.
                        </p>
                      </a>
                    </NavigationMenuLink>
                  </li>
                  <ListItem href="/docs#getting-started" title="Getting Started">
                    Quick start guide to begin using TaskForce
                  </ListItem>
                  <ListItem href="/docs#api" title="API Reference">
                    Complete API documentation and examples
                  </ListItem>
                  <ListItem href="/docs#guides" title="Guides">
                    Step-by-step tutorials and best practices
                  </ListItem>
                  <ListItem href="/docs#components" title="Components">
                    UI components and design system
                  </ListItem>
                </ul>
              </NavigationMenuContent>
            </NavigationMenuItem>
            <NavigationMenuItem>
              <a
                href="#roadmap"
                className="group inline-flex h-9 w-max items-center justify-center rounded-md bg-background px-4 py-2 text-sm font-medium transition-colors duration-200 hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus:outline-none disabled:pointer-events-none disabled:opacity-50"
              >
                {header.navigation.roadmap}
              </a>
            </NavigationMenuItem>
            <NavigationMenuItem>
              <NavigationMenuTrigger>Resources</NavigationMenuTrigger>
              <NavigationMenuContent>
                <ul className="grid w-[400px] gap-3 p-4 md:w-[500px] md:grid-cols-2">
                  <ListItem href="/terms" title="Terms of Service">
                    <FileText className="mr-2 h-4 w-4 inline" />
                    Legal terms and conditions
                  </ListItem>
                  <ListItem href="/privacy-policy" title="Privacy Policy">
                    <Shield className="mr-2 h-4 w-4 inline" />
                    How we protect your data
                  </ListItem>
                  <ListItem href="/accessibility" title="Accessibility">
                    <Eye className="mr-2 h-4 w-4 inline" />
                    Accessibility features and guidelines
                  </ListItem>
                  <ListItem href="#faq" title="FAQ">
                    Frequently asked questions
                  </ListItem>
                </ul>
              </NavigationMenuContent>
            </NavigationMenuItem>
          </NavigationMenuList>
        </NavigationMenu>

        <div className="flex flex-1 items-center justify-end gap-12">
          <div className="flex gap-2">
            <VersionSelector />
            <ThemeSwitcher />
            <Button variant="ghost" size="sm" asChild>
              <a
                href="https://github.com"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Github className="h-5 w-5" />
              </a>
            </Button>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              asChild
              className="hidden sm:flex"
            >
              <a href="/login">{header.buttons.login}</a>
            </Button>
            <Button size="sm" asChild className="hidden sm:flex">
              <a href="/register">{header.buttons.register}</a>
            </Button>
          </div>
          <div>
            <AccessibilityDropdown />
            <LanguageSelector />
          </div>
        </div>
      </div>
    </header>
  );
}

const ListItem = ({ className, title, children, href, ...props }: any) => {
  return (
    <li>
      <NavigationMenuLink asChild>
        <a
          href={href}
          className={cn(
            "block select-none space-y-1 rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground",
            className
          )}
          {...props}
        >
          <div className="text-sm font-medium leading-none">{title}</div>
          <p className="line-clamp-2 text-sm leading-snug text-muted-foreground">
            {children}
          </p>
        </a>
      </NavigationMenuLink>
    </li>
  );
};
