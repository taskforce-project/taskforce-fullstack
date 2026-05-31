import { cn } from "@/lib/utils";

export interface IntegrationItem {
  name: string;
  description?: string;
  logoUrl?: string;
  initial?: string;
  accent?: string;
  href?: string;
  category?: string;
}

// Octagon clip-path
const octagonClip = "polygon(30% 0%, 70% 0%, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0% 70%, 0% 30%)";

interface IntegrationLogoProps {
  item: IntegrationItem;
  size?: "sm" | "md" | "lg";
}

function IntegrationLogo({ item, size = "md" }: IntegrationLogoProps) {
  const accent = item.accent ?? "#60a5fa";
  const sizes = { sm: "w-10 h-10 text-xs", md: "w-14 h-14 text-sm", lg: "w-16 h-16 text-base" };

  return (
    <a
      href={item.href ?? "#"}
      title={item.name}
      className={cn("group flex flex-col items-center gap-2", item.href ? "cursor-pointer" : "cursor-default")}
    >
      <div
        className={cn("flex items-center justify-center font-bold transition-all duration-300 group-hover:scale-110", sizes[size])}
        style={{
          clipPath: octagonClip,
          background: `${accent}10`,
          border: `1px solid ${accent}20`,
          color: accent,
        }}
      >
        {item.logoUrl ? (
          <img src={item.logoUrl} alt={item.name} className="w-6 h-6 object-contain" />
        ) : (
          <span>{item.initial ?? item.name[0]}</span>
        )}
      </div>
      <span className="text-white/30 text-[10px] font-medium text-center leading-tight">{item.name}</span>
    </a>
  );
}

interface IntegrationsSectionProps {
  integrations: IntegrationItem[];
  className?: string;
}

export function IntegrationsSection({ integrations, className }: IntegrationsSectionProps) {
  return (
    <div className={cn("grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-6 justify-items-center", className)}>
      {integrations.map((item) => (
        <IntegrationLogo key={item.name} item={item} />
      ))}
    </div>
  );
}

export default IntegrationsSection;
