import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Container from "@/components/layout/Container";

const themes = [
  { name: "Modern Minimal", primary: "#000000", secondary: "#f5f5f5", accent: "#3b82f6" },
  { name: "Amethyst Haze", primary: "#9333ea", secondary: "#f3e8ff", accent: "#c084fc" },
  { name: "Catppuccin", primary: "#cba6f7", secondary: "#1e1e2e", accent: "#89b4fa" },
  { name: "Kodama Grove", primary: "#10b981", secondary: "#d1fae5", accent: "#34d399" },
  { name: "Quantum Rose", primary: "#ec4899", secondary: "#fce7f3", accent: "#f472b6" },
  { name: "Elegant Luxury", primary: "#854d0e", secondary: "#fef3c7", accent: "#f59e0b" },
  { name: "Neo Brutalism", primary: "#000000", secondary: "#fef08a", accent: "#f59e0b" },
  { name: "Cyberpunk", primary: "#ec4899", secondary: "#0f172a", accent: "#06b6d4" },
  { name: "Caffeine", primary: "#78350f", secondary: "#fef3c7", accent: "#d97706" },
  { name: "Midnight Bloom", primary: "#6366f1", secondary: "#1e1b4b", accent: "#818cf8" },
  { name: "Vintage Paper", primary: "#92400e", secondary: "#fef3c7", accent: "#d97706" },
  { name: "Ocean Breeze", primary: "#0891b2", secondary: "#cffafe", accent: "#06b6d4" },
];

export default function ThemePresets() {
  return (
    <section className="relative w-full py-20 md:py-32">
      <Container>
        <div className="text-center space-y-4 mb-16">
          <Badge variant="secondary" className="px-4 py-1.5 text-sm font-medium">
            ✦ Theme Presets
          </Badge>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight">
            Elevate Your Design Instantly
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Apply theme presets with a single click. See how each option enhances the look.
          </p>
        </div>

        {/* Infinite scroll animation */}
        <div className="relative overflow-hidden">
          <div className="flex gap-4 animate-scroll-left">
            {[...themes, ...themes].map((theme, index) => (
              <Card
                key={`${theme.name}-${index}`}
                className="flex-shrink-0 w-64 h-40 p-6 cursor-pointer transition-all duration-300 hover:scale-105 hover:shadow-xl group"
                style={{
                  background: `linear-gradient(135deg, ${theme.primary} 0%, ${theme.secondary} 100%)`,
                }}
              >
                <div className="flex flex-col h-full justify-between">
                  <div className="flex gap-2">
                    <div
                      className="h-4 w-4 rounded-full border-2 border-white/50"
                      style={{ backgroundColor: theme.primary }}
                    />
                    <div
                      className="h-4 w-4 rounded-full border-2 border-white/50"
                      style={{ backgroundColor: theme.secondary }}
                    />
                    <div
                      className="h-4 w-4 rounded-full border-2 border-white/50"
                      style={{ backgroundColor: theme.accent }}
                    />
                  </div>
                  <h3
                    className="font-semibold text-lg"
                    style={{
                      color: theme.primary === "#000000" || theme.primary.startsWith("#0") 
                        ? "#ffffff" 
                        : theme.secondary === "#000000" || theme.secondary.startsWith("#1")
                        ? "#000000"
                        : "#ffffff",
                    }}
                  >
                    {theme.name}
                  </h3>
                </div>
              </Card>
            ))}
          </div>
        </div>

        {/* Second row - reverse direction */}
        <div className="relative overflow-hidden mt-4">
          <div className="flex gap-4 animate-scroll-right">
            {[...themes, ...themes].reverse().map((theme, index) => (
              <Card
                key={`${theme.name}-reverse-${index}`}
                className="flex-shrink-0 w-64 h-40 p-6 cursor-pointer transition-all duration-300 hover:scale-105 hover:shadow-xl group"
                style={{
                  background: `linear-gradient(135deg, ${theme.secondary} 0%, ${theme.primary} 100%)`,
                }}
              >
                <div className="flex flex-col h-full justify-between">
                  <div className="flex gap-2">
                    <div
                      className="h-4 w-4 rounded-full border-2 border-white/50"
                      style={{ backgroundColor: theme.accent }}
                    />
                    <div
                      className="h-4 w-4 rounded-full border-2 border-white/50"
                      style={{ backgroundColor: theme.primary }}
                    />
                    <div
                      className="h-4 w-4 rounded-full border-2 border-white/50"
                      style={{ backgroundColor: theme.secondary }}
                    />
                  </div>
                  <h3
                    className="font-semibold text-lg"
                    style={{
                      color: theme.secondary === "#000000" || theme.secondary.startsWith("#0") || theme.secondary.startsWith("#1")
                        ? "#ffffff" 
                        : "#000000",
                    }}
                  >
                    {theme.name}
                  </h3>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </Container>

      <style>{`
        @keyframes scroll-left {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-50%);
          }
        }
        
        @keyframes scroll-right {
          0% {
            transform: translateX(-50%);
          }
          100% {
            transform: translateX(0);
          }
        }
        
        .animate-scroll-left {
          animation: scroll-left 40s linear infinite;
        }
        
        .animate-scroll-right {
          animation: scroll-right 40s linear infinite;
        }
        
        .animate-scroll-left:hover,
        .animate-scroll-right:hover {
          animation-play-state: paused;
        }
      `}</style>
    </section>
  );
}
