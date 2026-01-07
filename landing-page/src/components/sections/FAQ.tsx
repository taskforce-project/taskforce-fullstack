import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import Container from "@/components/layout/Container";

const faqs = [
  {
    question: "What is TaskForce?",
    answer: "TaskForce is a modern task management platform that helps teams collaborate effectively. It combines powerful features with beautiful design, offering customizable themes, real-time collaboration, and comprehensive analytics to boost your productivity.",
  },
  {
    question: "Is TaskForce free to use?",
    answer: "Yes! TaskForce offers a generous free tier that includes all core features. For teams requiring advanced features like unlimited integrations, priority support, and enhanced analytics, we offer premium plans at competitive prices.",
  },
  {
    question: "How does team collaboration work?",
    answer: "TaskForce provides real-time collaboration features including shared boards, task assignments, comments, mentions, and activity tracking. Team members can work together seamlessly, see updates instantly, and stay in sync across all devices.",
  },
  {
    question: "Can I customize the appearance?",
    answer: "Absolutely! TaskForce offers extensive customization options. Choose from our beautiful theme presets or create your own custom themes by adjusting colors, typography, and layout. Your workspace, your style.",
  },
  {
    question: "What platforms does TaskForce support?",
    answer: "TaskForce is a web-based application that works on all modern browsers. We also offer native mobile apps for iOS and Android (coming soon), ensuring you can manage your tasks from anywhere, on any device.",
  },
  {
    question: "How secure is my data?",
    answer: "Security is our top priority. All data is encrypted in transit and at rest using industry-standard encryption. We implement regular security audits, comply with GDPR, and never share your data with third parties without your consent.",
  },
  {
    question: "Can I integrate TaskForce with other tools?",
    answer: "Yes! TaskForce integrates with popular tools like GitHub, Slack, Google Calendar, and more. Our comprehensive REST API also allows you to build custom integrations tailored to your workflow.",
  },
  {
    question: "Is there a mobile app?",
    answer: "Native mobile apps for iOS and Android are currently in development and will be available soon. In the meantime, our web app is fully responsive and works great on mobile browsers.",
  },
];

export default function FAQ() {
  return (
    <section id="faq" className="relative w-full py-20 md:py-32 bg-muted/30">
      <Container>
        <div className="text-center space-y-4 mb-16">
          <Badge variant="secondary" className="px-4 py-1.5 text-sm font-medium">
            ✦ FAQ
          </Badge>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight">
            Frequently Asked Questions
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Find answers to common questions about TaskForce
          </p>
        </div>

        <div className="max-w-3xl mx-auto">
          <Accordion type="single" collapsible className="space-y-4">
            {faqs.map((faq, index) => (
              <AccordionItem
                key={index}
                value={`item-${index}`}
                className="border border-border/50 rounded-lg px-6 bg-card hover:border-primary/50 transition-colors"
              >
                <AccordionTrigger className="text-left font-semibold hover:no-underline py-5">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground pb-5 leading-relaxed">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>

          <div className="mt-12 text-center p-8 rounded-lg border border-border/50 bg-card">
            <h3 className="text-xl font-semibold mb-2">Still have questions?</h3>
            <p className="text-muted-foreground mb-4">
              Can't find the answer you're looking for? Our support team is here to help.
            </p>
            <a
              href="#"
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
            >
              Contact Support
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </a>
          </div>
        </div>
      </Container>
    </section>
  );
}
