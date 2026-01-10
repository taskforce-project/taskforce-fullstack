"use client";

import { usePreferencesStore } from "@/lib/store/preferences-store";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check } from "lucide-react";
import type { Step1Data } from "./RegisterStep1";
import type { Step2Data } from "./RegisterStep2";

interface Step3Props {
  step1Data: Step1Data;
  step2Data: Step2Data;
}

export function RegisterStep3({ step1Data, step2Data }: Step3Props) {
  const { t } = usePreferencesStore();

  return (
    <div className="space-y-6">
      {/* Review Section */}
      <Card className="p-6 space-y-4">
        <h3 className="font-semibold text-lg">{t.auth.register.step3.reviewTitle}</h3>
        
        {/* Personal Information */}
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">
            {t.auth.register.step3.personalInfo}
          </p>
          <div className="space-y-1 text-sm">
            <p>
              <span className="font-medium">{t.auth.register.step1.firstNameLabel}:</span>{" "}
              {step1Data.firstName}
            </p>
            <p>
              <span className="font-medium">{t.auth.register.step1.lastNameLabel}:</span>{" "}
              {step1Data.lastName}
            </p>
            <p>
              <span className="font-medium">{t.auth.register.step1.emailLabel}:</span>{" "}
              {step1Data.email}
            </p>
          </div>
        </div>

        {/* Organization Information */}
        <div className="space-y-2 pt-2 border-t">
          <p className="text-sm font-medium text-muted-foreground">
            {t.auth.register.step3.organizationInfo}
          </p>
          <div className="space-y-1 text-sm">
            <p>
              <span className="font-medium">
                {t.auth.register.step2.organizationNameLabel}:
              </span>{" "}
              {step2Data.organizationName}
            </p>
            <p>
              <span className="font-medium">{t.auth.register.step2.roleLabel}:</span>{" "}
              {step2Data.role && t.auth.register.step2.roles[step2Data.role as keyof typeof t.auth.register.step2.roles]}
            </p>
            {step2Data.teamSize && (
              <p>
                <span className="font-medium">{t.auth.register.step2.teamSizeLabel}:</span>{" "}
                {t.auth.register.step2.teamSizes[step2Data.teamSize as keyof typeof t.auth.register.step2.teamSizes]}
              </p>
            )}
            {step2Data.industry && (
              <p>
                <span className="font-medium">{t.auth.register.step2.industryLabel}:</span>{" "}
                {t.auth.register.step2.industries[step2Data.industry as keyof typeof t.auth.register.step2.industries]}
              </p>
            )}
          </div>
        </div>
      </Card>

      {/* Free Trial Card */}
      <Card className="p-6 bg-gradient-to-br from-primary/5 to-accent/5 border-primary/20">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Check className="w-5 h-5 text-primary" />
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-lg">
                {t.auth.register.step3.freeTrialTitle}
              </h3>
              <Badge variant="secondary" className="bg-primary/10 text-primary hover:bg-primary/20">
                14 jours
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {t.auth.register.step3.freeTrialDescription}
            </p>
            <ul className="space-y-1 text-sm">
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-primary" />
                <span>Accès complet à toutes les fonctionnalités</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-primary" />
                <span>Collaboration d'équipe illimitée</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-primary" />
                <span>Support prioritaire</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-primary" />
                <span>Aucune carte bancaire requise</span>
              </li>
            </ul>
          </div>
        </div>
      </Card>
    </div>
  );
}
