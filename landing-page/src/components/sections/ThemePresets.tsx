import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import Container from "@/components/layout/Container";

const testimonials = [
  {
    name: "Sarah Chen",
    role: "Product Designer",
    company: "Stripe",
    comment:
      "TaskForce transformed how our team collaborates. The interface is intuitive and the themes make it a joy to use every day.",
    avatar: "SC",
  },
  {
    name: "Marcus Rodriguez",
    role: "Lead Developer",
    company: "Vercel",
    comment:
      "Finally, a task manager that's both powerful and beautiful. The real-time collaboration features are game-changing.",
    avatar: "MR",
  },
  {
    name: "Emily Watson",
    role: "Startup Founder",
    company: "Notion",
    comment:
      "We switched from multiple tools to TaskForce. It's simplified our workflow and boosted productivity by 40%.",
    avatar: "EW",
  },
  {
    name: "David Kim",
    role: "Engineering Manager",
    company: "GitHub",
    comment:
      "The customization options are incredible. We've created a theme that matches our brand perfectly.",
    avatar: "DK",
  },
  {
    name: "Lisa Anderson",
    role: "UX Researcher",
    company: "Figma",
    comment:
      "TaskForce gets out of your way and lets you focus on what matters. Best task manager I've used in 10 years.",
    avatar: "LA",
  },
  {
    name: "James Miller",
    role: "Freelance Designer",
    company: "Indépendant",
    comment:
      "The attention to detail in the UI is outstanding. Every interaction feels polished and intentional.",
    avatar: "JM",
  },
  {
    name: "Sophie Martin",
    role: "Product Manager",
    company: "Slack",
    comment:
      "Our team loves the flexibility. We can organize projects exactly how we want them.",
    avatar: "SM",
  },
  {
    name: "Alex Turner",
    role: "CTO",
    company: "Linear",
    comment:
      "TaskForce handles our complex workflows with ease. It's become indispensable to our operations.",
    avatar: "AT",
  },
  {
    name: "Maria Garcia",
    role: "Design Lead",
    company: "Airbnb",
    comment:
      "Beautiful design meets powerful functionality. TaskForce sets a new standard for task management.",
    avatar: "MG",
  },
  {
    name: "Tom Brown",
    role: "Software Engineer",
    company: "Meta",
    comment:
      "The performance is incredible. Everything loads instantly and the UX is smooth as butter.",
    avatar: "TB",
  },
];

export default function ScrollingTestimonials() {
  return (
    <section className="relative w-full py-20 md:py-32">
      <Container>
        <div className="text-center space-y-4 mb-16">
          <Badge
            variant="secondary"
            className="px-4 py-1.5 text-sm font-medium"
          >
            ✦ Testimonials
          </Badge>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight">
            Loved by Professionals Worldwide
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            See what people are saying about TaskForce
          </p>
        </div>

        {/* Infinite scroll animation - Row 1 */}
        <div className="relative overflow-hidden">
          <div className="flex gap-4 animate-scroll-left">
            {[...testimonials, ...testimonials].map((testimonial, index) => (
              <Card
                key={`${testimonial.name}-${index}`}
                className="flex-shrink-0 w-80 p-6 cursor-pointer transition-all duration-200 hover:scale-105 hover:shadow-xl group"
              >
                <div className="flex items-start gap-4 mb-4">
                  <Avatar className="h-12 w-12 border-2 border-primary/20">
                    <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                      {testimonial.avatar}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <div className="font-semibold">{testimonial.name}</div>
                    <div className="text-sm text-muted-foreground">
                      {testimonial.role}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {testimonial.company}
                    </div>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  "{testimonial.comment}"
                </p>
              </Card>
            ))}
          </div>
        </div>

        {/* Second row - reverse direction */}
        <div className="relative overflow-hidden mt-4">
          <div className="flex gap-4 animate-scroll-right">
            {[...testimonials, ...testimonials]
              .reverse()
              .map((testimonial, index) => (
                <Card
                  key={`${testimonial.name}-reverse-${index}`}
                  className="flex-shrink-0 w-80 p-6 cursor-pointer transition-all duration-200 hover:scale-105 hover:shadow-xl group"
                >
                  <div className="flex items-start gap-4 mb-4">
                    <Avatar className="h-12 w-12 border-2 border-primary/20">
                      <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                        {testimonial.avatar}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <div className="font-semibold">{testimonial.name}</div>
                      <div className="text-sm text-muted-foreground">
                        {testimonial.role}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {testimonial.company}
                      </div>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    "{testimonial.comment}"
                  </p>
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
          animation: scroll-left 60s linear infinite;
        }
        
        .animate-scroll-right {
          animation: scroll-right 60s linear infinite;
        }
        
        .animate-scroll-left:hover,
        .animate-scroll-right:hover {
          animation-play-state: paused;
        }
      `}</style>
    </section>
  );
}

export function ThemePresets() {
  const themes = [
    {
      name: "Ocean",
      primary: "#0EA5E9",
      secondary: "#0284C7",
      accent: "#06B6D4",
    },
    {
      name: "Forest",
      primary: "#10B981",
      secondary: "#059669",
      accent: "#34D399",
    },
    {
      name: "Sunset",
      primary: "#F59E0B",
      secondary: "#D97706",
      accent: "#FBBF24",
    },
    {
      name: "Purple",
      primary: "#8B5CF6",
      secondary: "#7C3AED",
      accent: "#A78BFA",
    },
    {
      name: "Rose",
      primary: "#F43F5E",
      secondary: "#E11D48",
      accent: "#FB7185",
    },
  ];

  return (
    <section className="relative w-full py-20 md:py-32">
      <Container>
        <div className="text-center space-y-4 mb-16">
          <Badge
            variant="secondary"
            className="px-4 py-1.5 text-sm font-medium"
          >
            ✦ Theme Presets
          </Badge>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight">
            Elevate Your Design Instantly
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Apply theme presets with a single click. See how each option
            enhances the look.
          </p>
        </div>

        {/* Infinite scroll animation */}
        <div className="relative overflow-hidden">
          <div className="flex gap-4 animate-scroll-left">
            {[...themes, ...themes].map((theme, index) => (
              <Card
                key={`${theme.name}-${index}`}
                className="flex-shrink-0 w-64 h-40 p-6 cursor-pointer transition-all duration-200 hover:scale-105 hover:shadow-xl group"
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
                      color:
                        theme.primary === "#000000" ||
                        theme.primary.startsWith("#0")
                          ? "#ffffff"
                          : theme.secondary === "#000000" ||
                            theme.secondary.startsWith("#1")
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
                      color:
                        theme.secondary === "#000000" ||
                        theme.secondary.startsWith("#0") ||
                        theme.secondary.startsWith("#1")
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
