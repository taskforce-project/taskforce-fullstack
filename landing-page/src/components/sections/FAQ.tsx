import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Container } from "@/components/layout/";
import { ArrowRight, Sparkles } from "lucide-react";
import { useTranslation } from "@/contexts/LanguageContext";

export function FAQ() {
  const { t } = useTranslation();
  const { faq } = t;
  return (
    <section id="faq" className="relative w-full py-20 md:py-32 bg-muted/30">
      <Container>
        <div className="text-center space-y-4 mb-16">
          <Badge
            variant="secondary"
            className="px-4 py-1.5 text-sm font-medium"
          >
            <Sparkles className="inline-block w-3 h-3 mr-1.5" />
            {faq.badge}
          </Badge>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight">
            {faq.title}
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            {faq.description}
          </p>
        </div>

        <div className="max-w-3xl mx-auto">
          <Accordion type="single" collapsible className="space-y-4">
            {faq.items.map((item) => (
              <AccordionItem
                key={item.question}
                value={`item-${item.question}`}
                className="border border-border/50 rounded-lg px-6 bg-card hover:border-primary/50 transition-colors"
              >
                <AccordionTrigger className="text-left font-semibold hover:no-underline py-5">
                  {item.question}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground pb-5 leading-relaxed">
                  {item.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>

          <div className="mt-12 text-center p-8 rounded-lg border border-border/50 bg-card">
            <h3 className="text-xl font-semibold mb-2">{faq.cta.title}</h3>
            <p className="text-muted-foreground mb-4">{faq.cta.description}</p>
            <a
              href="#contact"
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
            >
              {faq.cta.button}
              <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </div>
      </Container>
    </section>
  );
}
