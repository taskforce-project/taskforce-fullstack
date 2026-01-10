"use client";

import { usePreferencesStore } from "@/lib/store/preferences-store";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface Step2Data {
  organizationName: string;
  role: string;
  teamSize: string;
  industry: string;
}

interface Step2Props {
  data: Step2Data;
  errors: Partial<Record<keyof Step2Data, string>>;
  onChange: (field: keyof Step2Data, value: string) => void;
  isLoading?: boolean;
}

export function RegisterStep2({ data, errors, onChange, isLoading }: Step2Props) {
  const { t } = usePreferencesStore();

  return (
    <div className="space-y-4">
      {/* Organization Name */}
      <div className="space-y-2">
        <Label htmlFor="organizationName">
          {t.auth.register.step2.organizationNameLabel}
        </Label>
        <Input
          id="organizationName"
          name="organizationName"
          type="text"
          placeholder={t.auth.register.step2.organizationNamePlaceholder}
          value={data.organizationName}
          onChange={(e) => onChange("organizationName", e.target.value)}
          className={errors.organizationName ? "border-destructive" : ""}
          disabled={isLoading}
          autoComplete="organization"
        />
        {errors.organizationName && (
          <p className="text-sm text-destructive">{errors.organizationName}</p>
        )}
      </div>

      {/* Role */}
      <div className="space-y-2">
        <Label htmlFor="role">{t.auth.register.step2.roleLabel}</Label>
        <Select
          value={data.role}
          onValueChange={(value) => onChange("role", value)}
          disabled={isLoading}
        >
          <SelectTrigger className={errors.role ? "border-destructive" : ""}>
            <SelectValue placeholder={t.auth.register.step2.rolePlaceholder} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="owner">
              {t.auth.register.step2.roles.owner}
            </SelectItem>
            <SelectItem value="admin">
              {t.auth.register.step2.roles.admin}
            </SelectItem>
            <SelectItem value="manager">
              {t.auth.register.step2.roles.manager}
            </SelectItem>
            <SelectItem value="member">
              {t.auth.register.step2.roles.member}
            </SelectItem>
            <SelectItem value="other">
              {t.auth.register.step2.roles.other}
            </SelectItem>
          </SelectContent>
        </Select>
        {errors.role && (
          <p className="text-sm text-destructive">{errors.role}</p>
        )}
      </div>

      {/* Team Size */}
      <div className="space-y-2">
        <Label htmlFor="teamSize">{t.auth.register.step2.teamSizeLabel}</Label>
        <Select
          value={data.teamSize}
          onValueChange={(value) => onChange("teamSize", value)}
          disabled={isLoading}
        >
          <SelectTrigger>
            <SelectValue placeholder={t.auth.register.step2.teamSizePlaceholder} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="solo">
              {t.auth.register.step2.teamSizes.solo}
            </SelectItem>
            <SelectItem value="small">
              {t.auth.register.step2.teamSizes.small}
            </SelectItem>
            <SelectItem value="medium">
              {t.auth.register.step2.teamSizes.medium}
            </SelectItem>
            <SelectItem value="large">
              {t.auth.register.step2.teamSizes.large}
            </SelectItem>
            <SelectItem value="enterprise">
              {t.auth.register.step2.teamSizes.enterprise}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Industry */}
      <div className="space-y-2">
        <Label htmlFor="industry">{t.auth.register.step2.industryLabel}</Label>
        <Select
          value={data.industry}
          onValueChange={(value) => onChange("industry", value)}
          disabled={isLoading}
        >
          <SelectTrigger>
            <SelectValue placeholder={t.auth.register.step2.industryPlaceholder} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="technology">
              {t.auth.register.step2.industries.technology}
            </SelectItem>
            <SelectItem value="finance">
              {t.auth.register.step2.industries.finance}
            </SelectItem>
            <SelectItem value="healthcare">
              {t.auth.register.step2.industries.healthcare}
            </SelectItem>
            <SelectItem value="education">
              {t.auth.register.step2.industries.education}
            </SelectItem>
            <SelectItem value="retail">
              {t.auth.register.step2.industries.retail}
            </SelectItem>
            <SelectItem value="manufacturing">
              {t.auth.register.step2.industries.manufacturing}
            </SelectItem>
            <SelectItem value="other">
              {t.auth.register.step2.industries.other}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
