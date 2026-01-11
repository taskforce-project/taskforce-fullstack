import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import Container from "@/components/layout/Container";
import { Sparkles } from "lucide-react";
import { useTranslation } from "@/contexts/LanguageContext";

export function Testimonials() {
  const { t } = useTranslation();
  const { testimonials } = t;
  return (
    <section className="relative w-full py-20 md:py-32">
      <Container>
        <div className="text-center space-y-4 mb-16">
          <Badge
            variant="secondary"
            className="px-4 py-1.5 text-sm font-medium"
          >
            <Sparkles className="inline-block w-3 h-3 mr-1.5" />
            {testimonials.badge}
          </Badge>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight">
            {testimonials.title}
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            {testimonials.description}
          </p>
        </div>

        {/* Infinite scroll animation - Row 1 */}
        <div className="relative overflow-hidden">
          <div className="flex gap-4 animate-scroll-left">
            {[...testimonials.items, ...testimonials.items].map((testimonial, index) => (
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
            {[...testimonials.items, ...testimonials.items]
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
