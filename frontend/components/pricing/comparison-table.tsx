"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, X, ChevronDown, ChevronUp, Info } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  featureComparison,
  type FeatureCategory,
} from "@/lib/constants/pricing-data";

interface ComparisonTableProps {
  className?: string;
}

export function ComparisonTable({ className }: Readonly<ComparisonTableProps>) {
  return (
    <div className={cn("w-full space-y-6", className)}>
      {/* Header */}
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">
          Comparaison détaillée des fonctionnalités
        </h2>
        <p className="text-muted-foreground">
          Trouvez le plan qui correspond parfaitement à vos besoins
        </p>
      </div>

      {/* Tableau comparatif */}
      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="w-[40%] sticky left-0 bg-muted/50 z-10">
                  Fonctionnalité
                </TableHead>
                <TableHead className="text-center font-semibold">
                  <div className="flex flex-col items-center gap-1">
                    <span>Gratuit</span>
                    <Badge variant="outline" className="text-xs">
                      0€
                    </Badge>
                  </div>
                </TableHead>
                <TableHead className="text-center font-semibold">
                  <div className="flex flex-col items-center gap-1">
                    <span className="flex items-center gap-1">
                      Pro
                      <Badge className="text-xs bg-primary">Populaire</Badge>
                    </span>
                    <Badge variant="outline" className="text-xs">
                      29€/mois
                    </Badge>
                  </div>
                </TableHead>
                <TableHead className="text-center font-semibold">
                  <div className="flex flex-col items-center gap-1">
                    <span>Enterprise</span>
                    <Badge variant="outline" className="text-xs">
                      Sur devis
                    </Badge>
                  </div>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {featureComparison.map((category, categoryIdx) => (
                <CategorySection
                  key={categoryIdx}
                  category={category}
                  isLast={categoryIdx === featureComparison.length - 1}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Footer CTA */}
      <div className="text-center space-y-4 py-8">
        <p className="text-sm text-muted-foreground">
          Des questions sur nos plans ?
        </p>
        <div className="flex gap-4 justify-center">
          <Button variant="outline" size="lg" asChild>
            <a href="mailto:contact@taskforce.com">Nous contacter</a>
          </Button>
          <Button size="lg" asChild>
            <a href="/auth/register">Commencer gratuitement</a>
          </Button>
        </div>
      </div>
    </div>
  );
}

interface CategorySectionProps {
  category: FeatureCategory;
  isLast: boolean;
}

function CategorySection({ category, isLast }: Readonly<CategorySectionProps>) {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} asChild>
      <>
        {/* Category Header */}
        <TableRow className="bg-muted/30 hover:bg-muted/50">
          <TableCell
            colSpan={4}
            className="sticky left-0 bg-muted/30 hover:bg-muted/50 z-10"
          >
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-between font-semibold text-base"
              >
                <span className="flex items-center gap-2">
                  {category.category}
                  <Badge variant="secondary" className="text-xs">
                    {category.features.length} fonctionnalités
                  </Badge>
                </span>
                {isOpen ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
            </CollapsibleTrigger>
          </TableCell>
        </TableRow>

        {/* Feature Rows */}
        <CollapsibleContent asChild>
          <>
            {category.features.map((feature, idx) => (
              <TableRow
                key={idx}
                className={cn(
                  "hover:bg-muted/20",
                  isLast &&
                    idx === category.features.length - 1 &&
                    "border-b-0",
                )}
              >
                {/* Feature Name */}
                <TableCell className="sticky left-0 bg-background z-10 border-r">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{feature.name}</span>
                    {feature.description && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="max-w-xs">{feature.description}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </div>
                </TableCell>

                {/* FREE */}
                <TableCell className="text-center">
                  <FeatureValue value={feature.free} />
                </TableCell>

                {/* PRO */}
                <TableCell className="text-center bg-primary/5">
                  <FeatureValue value={feature.pro} isPro />
                </TableCell>

                {/* ENTERPRISE */}
                <TableCell className="text-center">
                  <FeatureValue value={feature.enterprise} />
                </TableCell>
              </TableRow>
            ))}
          </>
        </CollapsibleContent>
      </>
    </Collapsible>
  );
}

interface FeatureValueProps {
  value: boolean | string;
  isPro?: boolean;
}

function FeatureValue({ value, isPro }: Readonly<FeatureValueProps>) {
  if (typeof value === "boolean") {
    return value ? (
      <Check
        className={cn(
          "h-5 w-5 mx-auto",
          isPro ? "text-primary" : "text-green-600",
        )}
      />
    ) : (
      <X className="h-5 w-5 text-muted-foreground/30 mx-auto" />
    );
  }

  return (
    <span className={cn("text-sm font-medium", isPro && "text-primary")}>
      {value}
    </span>
  );
}
