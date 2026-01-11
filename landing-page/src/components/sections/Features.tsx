import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Container } from "@/components/layout/";
import {
  Palette,
  Users,
  Zap,
  Lock,
  BarChart3,
  Smartphone,
  Sparkles,
} from "lucide-react";
import { useTranslation } from "@/contexts/LanguageContext";

const getFeatureIcon = (index: number) => {
  const icons = [Palette, Users, Zap, Lock, BarChart3, Smartphone];
  const Icon = icons[index];
  return <Icon className="h-6 w-6" />;
};

export function Features() {
  const { t } = useTranslation();
  const { features } = t;

  return (
    <section id="features" className="relative w-full py-20 md:py-32">
      <Container>
        <div className="text-center space-y-4 mb-16">
          <Badge
            variant="secondary"
            className="px-4 py-1.5 text-sm font-medium"
          >
            <Sparkles className="inline-block w-3 h-3 mr-1.5" />
            {features.badge}
          </Badge>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight">
            {features.title}
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            {features.description}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.items.map((feature, index) => (
            <Card
              key={feature.title}
              className="group relative overflow-hidden transition-all duration-200 hover:shadow-lg hover:-translate-y-1 border-border/50"
            >
              <div className="absolute inset-0 bg-linear-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <CardHeader>
                <div className="flex items-center gap-4">
                  <div className="relative inline-flex items-center justify-center shrink-0">
                    <div className="absolute inset-0 bg-primary/10 rounded-full blur-xl" />
                    <div className="inline-flex items-center justify-center rounded-lg bg-primary/10 p-2.5 text-primary group-hover:scale-110 transition-transform">
                      {getFeatureIcon(index)}
                    </div>
                  </div>
                  <CardTitle className="text-xl">{feature.title}</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground leading-relaxed">
                  {feature.description}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </Container>
    </section>
  );
}
