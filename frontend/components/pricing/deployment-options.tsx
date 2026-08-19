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
    title: "Cloud Deployment",
    description:
      "Secure hosting in Europe (France/Germany). Deploy in a few clicks with no infrastructure to manage.",
  },
  {
    id: "self-hosted",
    icon: Server,
    title: "Self-hosting (On-Premise)",
    description:
      "Keep full control of your data. Deploy TaskForce on your own servers with Keycloak and PostgreSQL.",
  },
  {
    id: "compliance",
    icon: ShieldCheck,
    title: "Compliance & Security",
    description:
      "GDPR-compliant, end-to-end encryption, automatic backups, and regular security audits.",
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
          Run TaskForce your way on your own infrastructure
        </h2>
        <p className="text-muted-foreground">
          Maximum flexibility to meet your infrastructure and compliance requirements
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
