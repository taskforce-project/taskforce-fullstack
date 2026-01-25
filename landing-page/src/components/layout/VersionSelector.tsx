import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { ChevronDown } from "lucide-react";

interface Version {
  version: string;
  releaseDate: string;
  isCurrent: boolean;
}

const versions: Version[] = [
  { version: "v1.0.0", releaseDate: "2026-01-07", isCurrent: true },
  { version: "v0.9.0", releaseDate: "2025-12-15", isCurrent: false },
  { version: "v0.8.0", releaseDate: "2025-11-20", isCurrent: false },
  { version: "v0.7.0", releaseDate: "2025-10-10", isCurrent: false },
];

export function VersionSelector() {
  const currentVersion = versions.find((v) => v.isCurrent) || versions[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1">
          <span className="hidden sm:inline">{currentVersion.version}</span>
          <span className="sm:hidden">v1.0</span>
          <ChevronDown className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Versions</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {versions.map((version) => (
          <DropdownMenuItem
            key={version.version}
            className="flex items-center justify-between cursor-pointer"
          >
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="font-medium">{version.version}</span>
                {version.isCurrent && (
                  <Badge variant="secondary" className="text-xs px-1.5 py-0">
                    Current
                  </Badge>
                )}
              </div>
              <span className="text-xs text-muted-foreground">
                {new Date(version.releaseDate).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </span>
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
