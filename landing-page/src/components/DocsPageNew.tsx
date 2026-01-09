import { useState } from "react";
import { Providers } from "@/components/Providers";
import { useTranslation } from "@/contexts/LanguageContext";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  BookOpen,
  Search,
  Zap,
  Code,
  Users,
  Shield,
  Settings,
  ChevronRight,
  Cloud,
  Layers,
  ArrowRight,
} from "lucide-react";

const iconMap: Record<string, any> = {
  Zap,
  Layers,
  Settings,
  Code,
  BookOpen,
  Cloud,
};

export default function DocsPageNew() {
  const { t } = useTranslation();
  const { docs } = t;
  const [searchQuery, setSearchQuery] = useState("");



  return (
    <Providers>
      <div className="min-h-screen bg-background">
        <Header />

      {/* Hero Section */}
      <section className="relative border-b border-border/40 bg-gradient-to-b from-background via-background/95 to-muted/20">
        <div className="container mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-8 py-24">
          <div className="max-w-4xl mx-auto text-center">
            <Badge className="mb-4" variant="outline">
              <BookOpen className="mr-1 h-3 w-3" />
              {docs.hero.badge}
            </Badge>
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl mb-6">
              {docs.hero.title.split(docs.hero.titleHighlight)[0]}
              <span className="bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                {docs.hero.titleHighlight}
              </span>
            </h1>
            <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
              {docs.hero.description}
            </p>

            {/* Search Bar */}
            <div className="max-w-xl mx-auto relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                type="search"
                placeholder={docs.search.placeholder}
                className="pl-10 h-12 text-base"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-3 gap-8 mt-12 max-w-2xl mx-auto">
              {docs.stats.map((stat) => (
                <div key={stat.label} className="text-center">
                  <div className="text-3xl font-bold text-primary">{stat.value}</div>
                  <div className="text-sm text-muted-foreground">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Quick Links */}
      <section className="py-16 border-b border-border/40">
        <div className="container mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-3 gap-6">
            {docs.quickLinks.map((link) => (
              <a
                key={link.title}
                href={link.href}
                className="group relative overflow-hidden rounded-lg border border-border bg-card p-6 transition-all hover:shadow-lg hover:-translate-y-1"
              >
                <div
                  className={`absolute inset-0 bg-gradient-to-br ${link.color} opacity-0 group-hover:opacity-100 transition-opacity`}
                />
                <div className="relative">
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
            {docs.sections.map((section) => {
              const Icon = iconMap[section.icon];
              return (
              <Card key={section.title} className="group hover:shadow-lg transition-all">
                <CardHeader>
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <Icon className="h-5 w-5 text-primary" />
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
            );})}
          </div>
        </div>
      </section>

      {/* Community & Support */}
      <section className="py-16 bg-muted/30 border-t border-border/40">
        <div className="container mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold mb-4">{docs.community.title}</h2>
              <p className="text-muted-foreground">
                {docs.community.description}
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-primary" />
                    {docs.community.communityCard.title}
                  </CardTitle>
                  <CardDescription>
                    {docs.community.communityCard.description}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {docs.community.communityCard.links.map((link) => (
                      <Button key={link.label} variant="outline" className="w-full justify-start" asChild>
                        <a href={link.href}>
                          <span className="flex-1 text-left">{link.label}</span>
                          <ChevronRight className="h-4 w-4" />
                        </a>
                      </Button>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5 text-primary" />
                    {docs.community.supportCard.title}
                  </CardTitle>
                  <CardDescription>
                    {docs.community.supportCard.description}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {docs.community.supportCard.links.map((link) => (
                      <Button key={link.label} variant="outline" className="w-full justify-start" asChild>
                        <a href={link.href}>
                          <span className="flex-1 text-left">{link.label}</span>
                          <ChevronRight className="h-4 w-4" />
                        </a>
                      </Button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      <Footer />
      </div>
    </Providers>
  );
}
