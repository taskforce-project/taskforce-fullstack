"use client";

import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  TrendingDown,
  Calculator,
  DollarSign,
  Users,
  Sparkles,
  Euro,
} from "lucide-react";
import {
  competitorTools,
  calculateSavings,
} from "@/lib/constants/pricing-data";

interface ROICalculatorProps {
  className?: string;
}

export function ROICalculator({ className }: Readonly<ROICalculatorProps>) {
  const [numberOfUsers, setNumberOfUsers] = useState(10);
  const [selectedTools, setSelectedTools] = useState<string[]>([
    "Jira",
    "Slack",
  ]);

  // Calcul des économies pour FREE et PRO
  const freeSavings = useMemo(
    () => calculateSavings(selectedTools, numberOfUsers, "free"),
    [selectedTools, numberOfUsers],
  );

  const proSavings = useMemo(
    () => calculateSavings(selectedTools, numberOfUsers, "pro"),
    [selectedTools, numberOfUsers],
  );

  const handleToolToggle = (toolName: string) => {
    setSelectedTools((prev) =>
      prev.includes(toolName)
        ? prev.filter((t) => t !== toolName)
        : [...prev, toolName],
    );
  };

  return (
    <div className={cn("w-full space-y-6", className)}>
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="flex items-center justify-center gap-2 mb-2">
          <Calculator className="h-8 w-8 text-primary" />
          <h2 className="text-3xl font-bold tracking-tight">
            Calculateur d&apos;économies
          </h2>
        </div>
        <p className="text-muted-foreground">
          Découvrez combien vous pourriez économiser en passant à TaskForce
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Configuration Panel */}
        <Card className="border-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Votre configuration actuelle
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Nombre d'utilisateurs */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="users-slider">Nombre d&apos;utilisateurs</Label>
                <Badge variant="secondary" className="text-lg font-bold">
                  {numberOfUsers}
                </Badge>
              </div>
              <Slider
                id="users-slider"
                min={1}
                max={100}
                step={1}
                value={[numberOfUsers]}
                onValueChange={(value) => setNumberOfUsers(value[0])}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>1 utilisateur</span>
                <span>100+ utilisateurs</span>
              </div>
            </div>

            {/* Outils actuels */}
            <div className="space-y-3">
              <Label>Outils que vous utilisez actuellement</Label>
              <div className="grid grid-cols-2 gap-3">
                {competitorTools.map((tool) => (
                  <div key={tool.name} className="flex items-center space-x-2">
                    <Checkbox
                      id={`tool-${tool.name}`}
                      checked={selectedTools.includes(tool.name)}
                      onCheckedChange={() => handleToolToggle(tool.name)}
                    />
                    <label
                      htmlFor={`tool-${tool.name}`}
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                    >
                      {tool.name}
                      <span className="text-xs text-muted-foreground ml-1 flex items-center gap-0.5">
                        ({tool.pricePerUser}<Euro className="h-3 w-3 inline" />/user)
                      </span>
                    </label>
                  </div>
                ))}
              </div>
              {selectedTools.length === 0 && (
                <p className="text-sm text-muted-foreground italic">
                  Sélectionnez au moins un outil pour voir les économies
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Résultats */}
        <div className="space-y-4">
          {/* Savings avec FREE */}
          <Card className="border-2 border-green-200 bg-linear-to-br from-green-50 to-transparent dark:from-green-950/20">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-green-600" />
                <span>Avec le plan GRATUIT</span>
                <Badge variant="secondary" className="ml-auto flex items-center gap-1">
                  0<Euro className="h-3.5 w-3.5" />
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <SavingsDisplay savings={freeSavings} />
            </CardContent>
          </Card>

          {/* Savings avec PRO */}
          <Card className="border-2 border-primary bg-linear-to-br from-primary/5 to-transparent">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <TrendingDown className="h-5 w-5 text-primary" />
                <span>Avec le plan PRO</span>
                <Badge className="ml-auto bg-primary flex items-center gap-1">
                  {29 * numberOfUsers}<Euro className="h-3.5 w-3.5" />/mois
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <SavingsDisplay savings={proSavings} isPro />
            </CardContent>
          </Card>

          {/* CTA */}
          <Card className="bg-linear-to-r from-purple-600 to-pink-600 text-white border-0">
            <CardContent className="pt-6 text-center space-y-2">
              <Sparkles className="h-8 w-8 mx-auto mb-2" />
              <p className="font-semibold text-lg flex items-center justify-center gap-1">
                Économisez jusqu&apos;à
                {Math.max(
                  freeSavings.yearlySavings,
                  proSavings.yearlySavings,
                ).toLocaleString("fr-FR")}<Euro className="h-5 w-5" />
                par an !
              </p>
              <p className="text-sm opacity-90">
                Essayez TaskForce gratuitement dès aujourd&apos;hui
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

interface SavingsDisplayProps {
  savings: ReturnType<typeof calculateSavings>;
  isPro?: boolean;
}

function SavingsDisplay({ savings, isPro }: Readonly<SavingsDisplayProps>) {
  const hasPositiveSavings = savings.monthlySavings > 0;

  return (
    <div className="space-y-3">
      {/* Coût actuel */}
      <div className="flex justify-between items-center">
        <span className="text-sm text-muted-foreground">Coût actuel</span>
        <span className="font-semibold flex items-center gap-1">
          {savings.currentMonthlyCost.toLocaleString("fr-FR")}<Euro className="h-4 w-4" />/mois
        </span>
      </div>

      {/* Coût TaskForce */}
      <div className="flex justify-between items-center">
        <span className="text-sm text-muted-foreground">Coût TaskForce</span>
        <span className={cn("font-semibold flex items-center gap-1", isPro && "text-primary")}>
          {savings.taskforceCost.toLocaleString("fr-FR")}<Euro className="h-4 w-4" />/mois
        </span>
      </div>

      <div className="border-t pt-3 space-y-2">
        {/* Économie mensuelle */}
        <div className="flex justify-between items-center">
          <span className="text-sm font-medium flex items-center gap-1">
            <DollarSign className="h-4 w-4" />
            Économie mensuelle
          </span>
          <span
            className={cn(
              "text-xl font-bold flex items-center gap-1",
              hasPositiveSavings ? "text-green-600" : "text-muted-foreground",
            )}
          >
            {hasPositiveSavings ? "+" : ""}
            {savings.monthlySavings.toLocaleString("fr-FR")}<Euro className="h-5 w-5" />
          </span>
        </div>

        {/* Économie annuelle */}
        <div className="flex justify-between items-center">
          <span className="text-sm font-medium flex items-center gap-1">
            <TrendingDown className="h-4 w-4" />
            Économie annuelle
          </span>
          <span
            className={cn(
              "text-2xl font-extrabold flex items-center gap-1",
              hasPositiveSavings ? "text-green-600" : "text-muted-foreground",
            )}
          >
            {hasPositiveSavings ? "+" : ""}
            {savings.yearlySavings.toLocaleString("fr-FR")}<Euro className="h-6 w-6" />
          </span>
        </div>

        {/* Pourcentage */}
        {hasPositiveSavings && (
          <div className="pt-2">
            <Badge
              variant="secondary"
              className="w-full justify-center text-base py-1.5 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
            >
              Vous économisez {savings.savingsPercentage.toFixed(0)}% !
            </Badge>
          </div>
        )}
      </div>
    </div>
  );
}
