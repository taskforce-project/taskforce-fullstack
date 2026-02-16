import { Providers } from "@/components/Providers";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/contexts/LanguageContext";
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
  type LucideIcon,
} from "lucide-react";

const iconMap: Record<string, LucideIcon> = {
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
};

export default function AccessibilityPageNew() {
  const { t } = useTranslation();
  const { accessibility } = t;

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
                {accessibility.hero.badge}
              </Badge>
              <h1 className="text-4xl font-bold tracking-tight sm:text-5xl mb-6">
                {accessibility.hero.title}
              </h1>
              <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
                {accessibility.hero.description}
              </p>

              <div className="flex flex-wrap gap-4 justify-center">
                <Button size="lg">
                  {accessibility.hero.buttons.getStarted}
                </Button>
                <Button size="lg" variant="outline">
                  {accessibility.hero.buttons.viewFeatures}
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
                    {accessibility.commitment.title}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {accessibility.commitment.paragraphs.map((paragraph, index) => (
                    <p key={index} className="text-muted-foreground leading-relaxed">
                      {paragraph}
                    </p>
                  ))}
                  <div className="flex items-start gap-3 p-4 rounded-lg bg-primary/5 border border-primary/20">
                    <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                    <p className="text-sm">
                      <strong>{accessibility.commitment.ongoingImprovement.title}:</strong>{" "}
                      {accessibility.commitment.ongoingImprovement.description}
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
                <Badge className="mb-4" variant="outline">
                  {accessibility.featuresSection.badge}
                </Badge>
                <h2 className="text-3xl font-bold mb-4">
                  {accessibility.featuresSection.title}
                </h2>
                <p className="text-muted-foreground max-w-2xl mx-auto">
                  {accessibility.featuresSection.description}
                </p>
              </div>

              <div className="space-y-8">
                {accessibility.features.map((category) => (
                  <Card key={category.category}>
                    <CardHeader>
                      <CardTitle className="text-2xl">
                        {category.category}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {category.items.map((item) => {
                          const Icon = iconMap[item.icon];
                          return (
                            <div
                              key={item.title}
                              className="group relative overflow-hidden rounded-lg border border-border bg-card p-5 transition-all hover:shadow-md"
                            >
                              <div className="relative">
                                <div className="flex items-start gap-3 mb-3">
                                  <Icon className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                                  <h3 className="font-semibold">{item.title}</h3>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                  {item.description}
                                </p>
                              </div>
                            </div>
                          );
                        })}
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
                <Badge className="mb-4" variant="outline">
                  {accessibility.standardsSection.badge}
                </Badge>
                <h2 className="text-3xl font-bold mb-4">
                  {accessibility.standardsSection.title}
                </h2>
                <p className="text-muted-foreground">
                  {accessibility.standardsSection.description}
                </p>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                {accessibility.standards.map((item) => (
                  <div
                    key={item.title}
                    className="flex items-start justify-between p-5 rounded-lg border border-border bg-background"
                  >
                    <div className="flex-1">
                      <h3 className="font-semibold mb-2">{item.title}</h3>
                      <p className="text-sm text-muted-foreground">
                        {item.description}
                      </p>
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
                  {accessibility.documentation.title}
                </h3>
                <p className="text-sm text-muted-foreground mb-4">
                  {accessibility.documentation.description}
                </p>
                <ul className="space-y-2">
                  {accessibility.documentation.items.map((item, index) => (
                    <li key={index} className="flex items-start gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
                <Button className="mt-4" variant="outline">
                  <FileText className="mr-2 h-4 w-4" />
                  {accessibility.documentation.button}
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
                <Badge className="mb-4" variant="outline">
                  {accessibility.toolsSection.badge}
                </Badge>
                <h2 className="text-3xl font-bold mb-4">
                  {accessibility.toolsSection.title}
                </h2>
                <p className="text-muted-foreground">
                  {accessibility.toolsSection.description}
                </p>
              </div>

              <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-4">
                {accessibility.tools.map((tool) => (
                  <div
                    key={tool.name}
                    className="p-4 rounded-lg border border-border bg-card text-center hover:shadow-md transition-shadow"
                  >
                    <div className="font-semibold mb-1">{tool.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {tool.category}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Keyboard Shortcuts Preview */}
        <section className="py-16 border-t border-border/40 bg-muted/30">
          <div className="container mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-4xl mx-auto">
              <div className="text-center mb-12">
                <Badge className="mb-4" variant="outline">
                  {accessibility.keyboardSection.badge}
                </Badge>
                <h2 className="text-3xl font-bold mb-4">
                  {accessibility.keyboardSection.title}
                </h2>
                <p className="text-muted-foreground">
                  {accessibility.keyboardSection.description}
                </p>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Keyboard className="h-5 w-5 text-primary" />
                    {accessibility.keyboardSection.title}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {accessibility.shortcuts.map((shortcut) => (
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
              <h2 className="text-3xl font-bold mb-4">
                {accessibility.feedback.title}
              </h2>
              <p className="text-muted-foreground mb-8 max-w-2xl mx-auto">
                {accessibility.feedback.description}
              </p>

              <Card>
                <CardContent className="p-8">
                  <div className="space-y-6">
                    <div className="flex flex-col sm:flex-row gap-3 justify-center">
                      <Button variant="outline">
                        {accessibility.feedback.contact.email}
                      </Button>
                    </div>

                    <div className="pt-6 border-t border-border">
                      <p className="text-sm text-muted-foreground">
                        {accessibility.feedback.closing}
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
