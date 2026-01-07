import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAccessibility } from "@/contexts/AccessibilityContext";
import { Accessibility, RotateCcw } from "lucide-react";

export default function AccessibilityDropdown() {
  const { settings, updateSettings, resetSettings } = useAccessibility();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" aria-label="Accessibility settings">
          <Accessibility className="h-5 w-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-4">
        <div className="flex items-center justify-between mb-4">
          <DropdownMenuLabel className="p-0 font-semibold text-base">
            Accessibility Settings
          </DropdownMenuLabel>
          <Button
            variant="ghost"
            size="sm"
            onClick={resetSettings}
            className="h-8 px-2"
            aria-label="Reset accessibility settings"
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
        </div>

        <DropdownMenuSeparator className="mb-4" />

        {/* Font Size */}
        <div className="space-y-2 mb-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="font-size" className="text-sm font-medium">
              Font Size
            </Label>
            <span className="text-sm text-muted-foreground">{settings.fontSize}%</span>
          </div>
          <Slider
            id="font-size"
            min={80}
            max={150}
            step={10}
            value={[settings.fontSize]}
            onValueChange={(value) => updateSettings({ fontSize: value[0] })}
            className="w-full"
          />
        </div>

        {/* Letter Spacing */}
        <div className="space-y-2 mb-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="letter-spacing" className="text-sm font-medium">
              Letter Spacing
            </Label>
            <span className="text-sm text-muted-foreground">
              {settings.letterSpacing.toFixed(2)}em
            </span>
          </div>
          <Slider
            id="letter-spacing"
            min={-0.05}
            max={0.2}
            step={0.01}
            value={[settings.letterSpacing]}
            onValueChange={(value) => updateSettings({ letterSpacing: value[0] })}
            className="w-full"
          />
        </div>

        <DropdownMenuSeparator className="my-4" />

        {/* Dyslexic Font */}
        <div className="flex items-center justify-between mb-4">
          <Label htmlFor="dyslexic-font" className="text-sm font-medium cursor-pointer">
            OpenDyslexic Font
          </Label>
          <Switch
            id="dyslexic-font"
            checked={settings.dyslexicFont}
            onCheckedChange={(checked) => updateSettings({ dyslexicFont: checked })}
          />
        </div>

        {/* High Contrast */}
        <div className="flex items-center justify-between mb-4">
          <Label htmlFor="high-contrast" className="text-sm font-medium cursor-pointer">
            High Contrast
          </Label>
          <Switch
            id="high-contrast"
            checked={settings.highContrast}
            onCheckedChange={(checked) => updateSettings({ highContrast: checked })}
          />
        </div>

        <DropdownMenuSeparator className="my-4" />

        {/* Daltonism Mode */}
        <div className="space-y-2">
          <Label htmlFor="daltonism-mode" className="text-sm font-medium">
            Color Blindness Mode
          </Label>
          <Select
            value={settings.daltonismMode}
            onValueChange={(value) =>
              updateSettings({
                daltonismMode: value as "none" | "protanopia" | "deuteranopia" | "tritanopia",
              })
            }
          >
            <SelectTrigger id="daltonism-mode" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              <SelectItem value="protanopia">Protanopia (Red-blind)</SelectItem>
              <SelectItem value="deuteranopia">Deuteranopia (Green-blind)</SelectItem>
              <SelectItem value="tritanopia">Tritanopia (Blue-blind)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
