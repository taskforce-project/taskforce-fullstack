import { Providers } from "@/components/Providers";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Eye,
  Ear,
  Brain,
  Keyboard,
  Monitor,
  Volume2,
  Type,
  MousePointer,
  Glasses,
  Users,
  CheckCircle2,
  FileText,
  Settings,
  Palette,
  Zap,
} from "lucide-react";

export default function AccessibilityPageNew() {
  const features = [
    {
      category: "Visual Accessibility",
      icon: Eye,
      color: "from-blue-500/20 to-cyan-500/20",
      items: [
        {
          title: "High Contrast Themes",
          description: "Multiple high-contrast themes optimized for low vision users",
          icon: Palette,
        },
        {
          title: "Adjustable Font Sizes",
          description: "Scale text from 75% to 200% without breaking layouts",
          icon: Type,
        },
        {
          title: "Screen Reader Support",
          description: "Full ARIA labeling and semantic HTML for NVDA, JAWS, and VoiceOver",
          icon: Volume2,
        },
        {
          title: "Focus Indicators",
          description: "Clear, visible focus states for keyboard navigation",
          icon: MousePointer,
        },
        {
          title: "Color-Blind Safe",
          description: "Never relying on color alone to convey information",
          icon: Glasses,
        },
      ],
    },
    {
      category: "Motor & Mobility",
      icon: Keyboard,
      color: "from-purple-500/20 to-pink-500/20",
      items: [
        {
          title: "Full Keyboard Navigation",
          description: "Complete access to all features using only keyboard",
          icon: Keyboard,
        },
        {
          title: "Customizable Shortcuts",
          description: "Define your own keyboard shortcuts for common actions",
          icon: Zap,
        },
        {
          title: "Large Click Targets",
          description: "Minimum 44×44px touch targets following WCAG AA standards",
          icon: MousePointer,
        },
        {
          title: "Voice Control Compatible",
          description: "Works seamlessly with Dragon NaturallySpeaking and voice commands",
          icon: Volume2,
        },
      ],
    },
    {
      category: "Cognitive & Learning",
      icon: Brain,
      color: "from-orange-500/20 to-yellow-500/20",
      items: [
        {
          title: "Clear Language",
          description: "Simple, concise instructions and labels",
          icon: FileText,
        },
        {
          title: "Consistent Layouts",
          description: "Predictable navigation and UI patterns throughout",
          icon: Monitor,
        },
        {
          title: "Distraction-Free Mode",
          description: "Minimize visual clutter and focus on essential content",
          icon: Eye,
        },
        {
          title: "Undo/Redo Actions",
          description: "Easily reverse mistakes with comprehensive undo support",
          icon: Settings,
        },
      ],
    },
    {
      category: "Auditory",
      icon: Ear,
      color: "from-green-500/20 to-emerald-500/20",
      items: [
        {
          title: "Visual Notifications",
          description: "All audio alerts have visual alternatives",
          icon: Eye,
        },
        {
          title: "Captions & Transcripts",
          description: "Video tutorials include captions and text transcripts",
          icon: FileText,
        },
        {
          title: "No Auto-Play Audio",
          description: "Media never plays automatically without user consent",
          icon: Volume2,
        },
      ],
    },
  ];

  const standards = [
    {
      standard: "WCAG 2.1 Level AA",
      description: "We meet or exceed Web Content Accessibility Guidelines 2.1 Level AA",
      status: "Compliant",
    },
    {
      standard: "Section 508",
      description: "Compliant with U.S. federal accessibility requirements",
      status: "Compliant",
    },
    {
      standard: "EN 301 549",
      description: "European standard for digital accessibility",
      status: "Compliant",
    },
    {
      standard: "ADA",
      description: "Americans with Disabilities Act compliant",
      status: "Compliant",
    },
  ];

  const tools = [
    { name: "NVDA", category: "Screen Reader" },
    { name: "JAWS", category: "Screen Reader" },
    { name: "VoiceOver", category: "Screen Reader" },
    { name: "TalkBack", category: "Screen Reader (Mobile)" },
    { name: "Dragon NaturallySpeaking", category: "Voice Control" },
    { name: "ZoomText", category: "Screen Magnifier" },
    { name: "Windows High Contrast", category: "Visual" },
    { name: "Browser Zoom", category: "Visual" },
  ];

  return (
    <Providers>
      <div className="min-h-screen bg-background">
        <Header />

      {/* Hero Section */}
      <section className="relative border-b border-border/40 bg-gradient-to-b from-background via-background/95 to-muted/20">
        <div className="container mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-8 py-20">
          <div className="max-w-4xl mx-auto text-center">
            <Badge className="mb-4" variant="outline">
              <Eye className="mr-1 h-3 w-3" />
              Accessibility
            </Badge>
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl mb-6">
              Built for{" "}
              <span className="bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                Everyone
              </span>
            </h1>
            <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
              TaskForce is committed to providing an inclusive experience for all users, 
              regardless of abilities or disabilities. Accessibility is not an afterthought—it's 
              built into everything we do.
            </p>

            <div className="flex flex-wrap gap-4 justify-center">
              <Button size="lg">
                <Settings className="mr-2 h-5 w-5" />
                Accessibility Settings
              </Button>
              <Button size="lg" variant="outline">
                <FileText className="mr-2 h-5 w-5" />
                Download VPAT
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Commitment Statement */}
      <section className="py-12 border-b border-border/40 bg-muted/30">
        <div className="container mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-2xl">
                  <Users className="h-6 w-6 text-primary" />
                  Our Commitment
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-muted-foreground leading-relaxed">
                  We believe that productivity tools should be accessible to everyone. TaskForce is 
                  designed to meet the needs of users with diverse abilities, including those with 
                  visual, auditory, motor, and cognitive disabilities.
                </p>
                <p className="text-muted-foreground leading-relaxed">
                  Our team actively works with users who rely on assistive technologies to ensure 
                  TaskForce provides a seamless experience. We conduct regular accessibility audits, 
                  automated testing, and user testing with people with disabilities.
                </p>
                <div className="flex items-start gap-3 p-4 rounded-lg bg-primary/5 border border-primary/20">
                  <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                  <p className="text-sm">
                    <strong>Ongoing Improvement:</strong> We continuously monitor and improve our 
                    accessibility features based on user feedback and evolving standards.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Accessibility Features */}
      <section className="py-16">
        <div className="container mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold mb-4">Accessibility Features</h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                Comprehensive features designed to support users with different abilities
              </p>
            </div>

            <div className="space-y-8">
              {features.map((category) => (
                <Card key={category.category}>
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <div className="p-3 rounded-lg bg-primary/10">
                        <category.icon className="h-6 w-6 text-primary" />
                      </div>
                      <CardTitle className="text-2xl">{category.category}</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid md:grid-cols-2 gap-4">
                      {category.items.map((item) => (
                        <div
                          key={item.title}
                          className="group relative overflow-hidden rounded-lg border border-border bg-card p-5 transition-all hover:shadow-md"
                        >
                          <div
                            className={`absolute inset-0 bg-gradient-to-br ${category.color} opacity-0 group-hover:opacity-100 transition-opacity`}
                          />
                          <div className="relative">
                            <div className="flex items-start gap-3 mb-3">
                              <item.icon className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                              <h3 className="font-semibold">{item.title}</h3>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {item.description}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Standards Compliance */}
      <section className="py-16 border-y border-border/40 bg-muted/30">
        <div className="container mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold mb-4">Standards & Compliance</h2>
              <p className="text-muted-foreground">
                We adhere to international accessibility standards and regulations
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              {standards.map((item) => (
                <div
                  key={item.standard}
                  className="flex items-start justify-between p-5 rounded-lg border border-border bg-background"
                >
                  <div className="flex-1">
                    <h3 className="font-semibold mb-2">{item.standard}</h3>
                    <p className="text-sm text-muted-foreground">{item.description}</p>
                  </div>
                  <Badge className="ml-4 bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20">
                    <CheckCircle2 className="mr-1 h-3 w-3" />
                    {item.status}
                  </Badge>
                </div>
              ))}
            </div>

            <div className="mt-8 p-6 rounded-lg bg-background border border-border">
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                Accessibility Documentation
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                We provide comprehensive accessibility documentation including:
              </p>
              <ul className="space-y-2">
                <li className="flex items-start gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                  <span>VPAT (Voluntary Product Accessibility Template)</span>
                </li>
                <li className="flex items-start gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                  <span>ACR (Accessibility Conformance Report)</span>
                </li>
                <li className="flex items-start gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                  <span>Keyboard shortcuts reference guide</span>
                </li>
                <li className="flex items-start gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                  <span>Screen reader user guide</span>
                </li>
              </ul>
              <Button className="mt-4" variant="outline">
                <FileText className="mr-2 h-4 w-4" />
                Download Documentation
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Supported Assistive Technologies */}
      <section className="py-16">
        <div className="container mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold mb-4">Supported Assistive Technologies</h2>
              <p className="text-muted-foreground">
                TaskForce is tested and optimized for the following assistive technologies
              </p>
            </div>

            <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-4">
              {tools.map((tool) => (
                <div
                  key={tool.name}
                  className="p-4 rounded-lg border border-border bg-card text-center hover:shadow-md transition-shadow"
                >
                  <div className="font-semibold mb-1">{tool.name}</div>
                  <div className="text-xs text-muted-foreground">{tool.category}</div>
                </div>
              ))}
            </div>

            <div className="mt-8 text-center">
              <p className="text-sm text-muted-foreground">
                Don't see your assistive technology listed?{" "}
                <a href="#feedback" className="text-primary hover:underline">
                  Let us know
                </a>{" "}
                so we can test and add support.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Keyboard Shortcuts Preview */}
      <section className="py-16 border-t border-border/40 bg-muted/30">
        <div className="container mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold mb-4">Keyboard Navigation</h2>
              <p className="text-muted-foreground">
                Essential keyboard shortcuts for efficient navigation
              </p>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Keyboard className="h-5 w-5 text-primary" />
                  Common Shortcuts
                </CardTitle>
                <CardDescription>
                  Press <kbd className="px-2 py-1 text-xs font-semibold bg-muted rounded">?</kbd> 
                  {" "}anytime to see all available shortcuts
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {[
                    { keys: "Tab", action: "Move to next interactive element" },
                    { keys: "Shift + Tab", action: "Move to previous interactive element" },
                    { keys: "Enter", action: "Activate button or link" },
                    { keys: "Esc", action: "Close dialog or cancel action" },
                    { keys: "Ctrl + /", action: "Open command palette" },
                    { keys: "Ctrl + K", action: "Quick search" },
                    { keys: "Ctrl + N", action: "Create new task" },
                    { keys: "?", action: "Show all keyboard shortcuts" },
                  ].map((shortcut) => (
                    <div
                      key={shortcut.keys}
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                    >
                      <span className="text-sm">{shortcut.action}</span>
                      <kbd className="px-3 py-1.5 text-xs font-mono font-semibold bg-background border border-border rounded">
                        {shortcut.keys}
                      </kbd>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Feedback Section */}
      <section id="feedback" className="py-16 border-t border-border/40">
        <div className="container mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-3xl font-bold mb-4">Help Us Improve</h2>
            <p className="text-muted-foreground mb-8 max-w-2xl mx-auto">
              We're committed to continuous improvement. If you encounter any accessibility 
              barriers or have suggestions, please let us know.
            </p>

            <Card>
              <CardContent className="p-8">
                <div className="space-y-6">
                  <div>
                    <h3 className="font-semibold mb-2">Contact Our Accessibility Team</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      We typically respond within 24-48 hours
                    </p>
                    <div className="flex flex-col sm:flex-row gap-3 justify-center">
                      <Button>
                        <FileText className="mr-2 h-4 w-4" />
                        Report Accessibility Issue
                      </Button>
                      <Button variant="outline">
                        Email: accessibility@taskforce.app
                      </Button>
                    </div>
                  </div>

                  <div className="pt-6 border-t border-border">
                    <p className="text-sm text-muted-foreground">
                      We welcome feedback from users of assistive technologies and accessibility 
                      professionals. Your input helps us create a better experience for everyone.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <Footer />
      </div>
    </Providers>
  );
}
