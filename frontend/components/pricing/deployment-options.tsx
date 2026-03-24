"use client";

import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Cloud, Server, ShieldCheck } from "lucide-react";

interface DeploymentOption {
  id: string;
  icon: typeof Cloud;
  title: string;
  description: string;
}

const deploymentOptions: DeploymentOption[] = [
  {
    id: "cloud",
    icon: Cloud,
    title: "Déploiement Cloud",
    description:
      "Hébergement sécurisé en Europe (France/Allemagne). Déployez en quelques clics sans infrastructure à gérer.",
  },
  {
    id: "self-hosted",
    icon: Server,
    title: "Auto-hébergement (On-Premise)",
    description:
      "Gardez le contrôle total de vos données. Déployez TaskForce sur vos propres serveurs avec Keycloak et PostgreSQL.",
  },
  {
    id: "compliance",
    icon: ShieldCheck,
    title: "Conformité & Sécurité",
    description:
      "Conforme RGPD, chiffrement de bout en bout, sauvegardes automatiques et audits de sécurité réguliers.",
  },
];

interface DeploymentOptionsProps {
  className?: string;
}

export function DeploymentOptions({ className }: Readonly<DeploymentOptionsProps>) {
  return (
    <section className={cn("w-full space-y-6", className)}>
      {/* Header */}
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">
          Exécutez TaskForce à votre manière sur votre infrastructure
        </h2>
        <p className="text-muted-foreground">
          Flexibilité maximale pour répondre à vos exigences d'infrastructure et de conformité
        </p>
      </div>

      {/* Options */}
      <div className="grid gap-6 md:grid-cols-3">
        {deploymentOptions.map((option) => {
          const Icon = option.icon;
          return (
            <Card
              key={option.id}
              className="border-2 hover:border-primary/50 transition-colors"
            >
              <CardHeader>
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Icon className="h-6 w-6 text-primary" />
                  </div>
                </div>
                <CardTitle className="text-xl">{option.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {option.description}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
