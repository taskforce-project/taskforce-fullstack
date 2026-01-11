import React, { type ReactElement } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Container from "@/components/layout/Container";
import {
  Smartphone,
  Code,
  Lightbulb,
  BarChart3,
  Tag,
  Wifi,
  Video,
  Clock,
  Sparkles,
} from "lucide-react";
import { useTranslation } from "@/contexts/LanguageContext";

const getIconForItem = (index: number): ReactElement => {
  const icons = [
    <Smartphone className="h-6 w-6" />, // Mobile Applications
    <Code className="h-6 w-6" />, // API Integration
    <Lightbulb className="h-6 w-6" />, // AI-Powered Insights
    <BarChart3 className="h-6 w-6" />, // Advanced Analytics
    <Tag className="h-6 w-6" />, // White Label Solution
    <Wifi className="h-6 w-6" />, // Offline Mode
    <Video className="h-6 w-6" />, // Video Collaboration
    <Clock className="h-6 w-6" />, // Time Tracking
  ];
  return icons[index] || <Sparkles className="h-6 w-6" />;
};

export function Roadmap() {
  const { t } = useTranslation();
  const { roadmap } = t;

  const statusConfig = {
    done: {
      label: roadmap.status.done,
      variant: "default" as const,
      color: "text-emerald-600 dark:text-emerald-400",
    },
    "in-progress": {
      label: roadmap.status.inProgress,
      variant: "secondary" as const,
      color: "text-blue-600 dark:text-blue-400",
    },
    "coming-soon": {
      label: roadmap.status.comingSoon,
      variant: "outline" as const,
      color: "text-amber-600 dark:text-amber-400",
    },
    planned: {
      label: roadmap.status.planned,
      variant: "outline" as const,
      color: "text-muted-foreground",
    },
  };

  return (
    <section id="roadmap" className="relative w-full py-20 md:py-32">
      <Container>
        <div className="text-center space-y-4 mb-16">
          <Badge
            variant="secondary"
            className="px-4 py-1.5 text-sm font-medium"
          >
            <Sparkles className="inline-block w-3 h-3 mr-1.5" />
            {roadmap.badge}
          </Badge>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight">
            {roadmap.title}
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            {roadmap.description}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {roadmap.items.map((item, index) => {
            const config =
              statusConfig[item.status as keyof typeof statusConfig];
            return (
              <Card
                key={index}
                className="group relative overflow-hidden transition-all duration-200 hover:shadow-lg hover:-translate-y-1"
              >
                <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-full blur-2xl group-hover:bg-primary/10 transition-colors" />
                <CardHeader>
                  <div className="flex items-start justify-between mb-3">
                    <div
                      className={`inline-flex items-center justify-center rounded-lg bg-primary/10 p-2.5 text-primary group-hover:scale-110 transition-transform ${config.color}`}
                    >
                      {getIconForItem(index)}
                    </div>
                    <Badge variant={config.variant} className="text-xs">
                      {config.label}
                    </Badge>
                  </div>
                  <CardTitle className="text-lg">{item.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {item.description}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </Container>
    </section>
  );
}
