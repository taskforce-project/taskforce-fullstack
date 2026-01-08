import { useState } from "react";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  BookOpen,
  Search,
  Zap,
  Code,
  Palette,
  Users,
  Shield,
  Settings,
  ChevronRight,
  FileCode,
  Database,
  Cloud,
  Terminal,
  Layers,
  ArrowRight,
} from "lucide-react";

export default function DocsPageNew() {
  const [searchQuery, setSearchQuery] = useState("");

  const sections = [
    {
      title: "Getting Started",
      description: "Everything you need to start using TaskForce",
      icon: Zap,
      items: [
        { name: "Introduction", href: "#introduction", badge: "Start Here" },
        { name: "Installation", href: "#installation" },
        { name: "Quick Start", href: "#quick-start" },
        { name: "Configuration", href: "#configuration" },
        { name: "First Project", href: "#first-project" },
      ],
    },
    {
      title: "Core Concepts",
      description: "Learn the fundamentals of TaskForce",
      icon: Layers,
      items: [
        { name: "Projects & Tasks", href: "#projects-tasks" },
        { name: "Workspaces", href: "#workspaces" },
        { name: "Teams & Permissions", href: "#teams-permissions" },
        { name: "Labels & Priorities", href: "#labels-priorities" },
        { name: "Filters & Views", href: "#filters-views" },
      ],
    },
    {
      title: "Features",
      description: "Explore powerful features",
      icon: Settings,
      items: [
        { name: "Real-time Collaboration", href: "#collaboration" },
        { name: "Custom Themes", href: "#themes", badge: "Popular" },
        { name: "Automation", href: "#automation" },
        { name: "Integrations", href: "#integrations" },
        { name: "Mobile Apps", href: "#mobile" },
      ],
    },
    {
      title: "API Reference",
      description: "Integrate TaskForce with your tools",
      icon: Code,
      items: [
        { name: "Authentication", href: "#api-auth" },
        { name: "REST API", href: "#rest-api", badge: "v2.0" },
        { name: "WebSocket API", href: "#websocket-api" },
        { name: "SDKs", href: "#sdks" },
        { name: "Rate Limits", href: "#rate-limits" },
      ],
    },
    {
      title: "Guides & Tutorials",
      description: "Step-by-step guides",
      icon: BookOpen,
      items: [
        { name: "Team Onboarding", href: "#guide-onboarding" },
        { name: "Custom Workflows", href: "#guide-workflows" },
        { name: "Advanced Filtering", href: "#guide-filtering" },
        { name: "Theme Customization", href: "#guide-themes" },
        { name: "Data Export", href: "#guide-export" },
      ],
    },
    {
      title: "Deployment",
      description: "Deploy and scale TaskForce",
      icon: Cloud,
      items: [
        { name: "Self-Hosting", href: "#self-hosting" },
        { name: "Docker Setup", href: "#docker" },
        { name: "Environment Variables", href: "#env-vars" },
        { name: "Database Setup", href: "#database" },
        { name: "Security Best Practices", href: "#security" },
      ],
    },
  ];

  const quickLinks = [
    {
      title: "API Documentation",
      description: "Complete API reference with examples",
      icon: Terminal,
      href: "#api-docs",
      color: "from-blue-500/20 to-cyan-500/20",
    },
    {
      title: "Theme Builder",
      description: "Create custom themes for your workspace",
      icon: Palette,
      href: "#theme-builder",
      color: "from-purple-500/20 to-pink-500/20",
    },
    {
      title: "Examples",
      description: "Real-world examples and code snippets",
      icon: FileCode,
      href: "#examples",
      color: "from-orange-500/20 to-yellow-500/20",
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* Hero Section */}
      <section className="relative border-b border-border/40 bg-gradient-to-b from-background via-background/95 to-muted/20">
        <div className="container mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-8 py-24">
          <div className="max-w-4xl mx-auto text-center">
            <Badge className="mb-4" variant="outline">
              <BookOpen className="mr-1 h-3 w-3" />
              Documentation
            </Badge>
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl mb-6">
              Everything you need to build{" "}
              <span className="bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                amazing workflows
              </span>
            </h1>
            <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
              Comprehensive guides, API references, and examples to help you get
              the most out of TaskForce.
            </p>

            {/* Search Bar */}
            <div className="max-w-xl mx-auto relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search documentation..."
                className="pl-10 h-12 text-base"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-3 gap-8 mt-12 max-w-2xl mx-auto">
              <div className="text-center">
                <div className="text-3xl font-bold text-primary">100+</div>
                <div className="text-sm text-muted-foreground">Guides</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-primary">50+</div>
                <div className="text-sm text-muted-foreground">API Endpoints</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-primary">24/7</div>
                <div className="text-sm text-muted-foreground">Support</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Quick Links */}
      <section className="py-16 border-b border-border/40">
        <div className="container mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-3 gap-6">
            {quickLinks.map((link) => (
              <a
                key={link.title}
                href={link.href}
                className="group relative overflow-hidden rounded-lg border border-border bg-card p-6 transition-all hover:shadow-lg hover:-translate-y-1"
              >
                <div
                  className={`absolute inset-0 bg-gradient-to-br ${link.color} opacity-0 group-hover:opacity-100 transition-opacity`}
                />
                <div className="relative">
                  <link.icon className="h-10 w-10 mb-4 text-primary" />
                  <h3 className="text-xl font-semibold mb-2">{link.title}</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    {link.description}
                  </p>
                  <div className="flex items-center text-primary text-sm font-medium">
                    Learn more
                    <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </div>
                </div>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* Documentation Sections */}
      <section className="py-16">
        <div className="container mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {sections.map((section) => (
              <Card key={section.title} className="group hover:shadow-lg transition-all">
                <CardHeader>
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <section.icon className="h-5 w-5 text-primary" />
                    </div>
                    <CardTitle className="text-xl">{section.title}</CardTitle>
                  </div>
                  <CardDescription>{section.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {section.items.map((item) => (
                      <li key={item.name}>
                        <a
                          href={item.href}
                          className="flex items-center justify-between py-2 px-3 rounded-md hover:bg-accent transition-colors group/item"
                        >
                          <span className="text-sm flex items-center gap-2">
                            <ChevronRight className="h-4 w-4 text-muted-foreground group-hover/item:text-primary transition-colors" />
                            {item.name}
                          </span>
                          {item.badge && (
                            <Badge variant="secondary" className="text-xs">
                              {item.badge}
                            </Badge>
                          )}
                        </a>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Community & Support */}
      <section className="py-16 bg-muted/30 border-t border-border/40">
        <div className="container mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold mb-4">Need Help?</h2>
              <p className="text-muted-foreground">
                Our community and support team are here to help
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-primary" />
                    Community
                  </CardTitle>
                  <CardDescription>
                    Join our vibrant community for discussions and help
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <Button variant="outline" className="w-full justify-start">
                      <span className="flex-1 text-left">Discord Community</span>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" className="w-full justify-start">
                      <span className="flex-1 text-left">GitHub Discussions</span>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" className="w-full justify-start">
                      <span className="flex-1 text-left">Stack Overflow</span>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5 text-primary" />
                    Support
                  </CardTitle>
                  <CardDescription>
                    Get help from our dedicated support team
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <Button variant="outline" className="w-full justify-start">
                      <span className="flex-1 text-left">Contact Support</span>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" className="w-full justify-start">
                      <span className="flex-1 text-left">Report an Issue</span>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" className="w-full justify-start">
                      <span className="flex-1 text-left">Feature Requests</span>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
