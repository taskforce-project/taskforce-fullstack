"use client";

import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Quote } from "lucide-react";
import { testimonials, type Testimonial } from "@/lib/constants/pricing-data";

interface TestimonialsSectionProps {
  className?: string;
}

export function TestimonialsSection({
  className,
}: Readonly<TestimonialsSectionProps>) {
  return (
    <section className={cn("w-full space-y-8", className)}>
      {/* Header */}
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">
          Des équipes qui nous font confiance
        </h2>
        <p className="text-muted-foreground">
          Rejoignez plus de 1,000+ équipes qui utilisent TaskForce au quotidien
        </p>
      </div>

      {/* Testimonials Grid */}
      <div className="grid gap-6 md:grid-cols-3">
        {testimonials.map((testimonial) => (
          <TestimonialCard key={testimonial.id} testimonial={testimonial} />
        ))}
      </div>
    </section>
  );
}

interface TestimonialCardProps {
  testimonial: Testimonial;
}

function TestimonialCard({ testimonial }: Readonly<TestimonialCardProps>) {
  const initials = testimonial.author
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase();

  return (
    <Card className="border-2 hover:shadow-lg transition-shadow">
      <CardContent className="pt-6 space-y-4">
        {/* Quote Icon */}
        <Quote className="h-8 w-8 text-primary/20" />

        {/* Quote Text */}
        <p className="text-sm leading-relaxed italic">"{testimonial.quote}"</p>

        {/* Author */}
        <div className="flex items-center gap-3 pt-4 border-t">
          <Avatar className="h-10 w-10">
            <AvatarFallback className="bg-primary/10 text-primary font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="font-semibold text-sm">{testimonial.author}</p>
            <p className="text-xs text-muted-foreground">
              {testimonial.role} • {testimonial.company}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
