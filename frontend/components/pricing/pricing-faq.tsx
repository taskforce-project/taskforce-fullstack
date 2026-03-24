"use client";

import { cn } from "@/lib/utils";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { pricingFAQ } from "@/lib/constants/pricing-data";

interface PricingFAQProps {
  className?: string;
}

export function PricingFAQ({ className }: Readonly<PricingFAQProps>) {
  return (
    <section className={cn("w-full space-y-8", className)}>
      {/* Header */}
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">
          À quoi pouvons-nous répondre aujourd'hui ?
        </h2>
        <p className="text-muted-foreground">
          Tout ce que vous devez savoir sur nos tarifs et nos plans
        </p>
      </div>

      {/* FAQ Accordion */}
      <div className="max-w-3xl mx-auto">
        <Accordion type="single" collapsible className="w-full space-y-2">
          {pricingFAQ.map((faq, index) => (
            <AccordionItem
              key={index}
              value={`item-${index}`}
              className="border rounded-lg px-4 bg-card"
            >
              <AccordionTrigger className="text-left font-semibold hover:no-underline">
                {faq.question}
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground leading-relaxed">
                {faq.answer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
