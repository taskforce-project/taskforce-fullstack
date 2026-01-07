import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import Container from "@/components/layout/Container";

const testimonials = [
  {
    name: "Sarah Chen",
    handle: "@sarahchen",
    role: "Product Designer",
    content: "TaskForce transformed how our team collaborates. The interface is intuitive and the themes make it a joy to use every day.",
    avatar: "SC",
  },
  {
    name: "Marcus Rodriguez",
    handle: "@marcusdev",
    role: "Lead Developer",
    content: "Finally, a task manager that's both powerful and beautiful. The real-time collaboration features are game-changing.",
    avatar: "MR",
  },
  {
    name: "Emily Watson",
    handle: "@emilywatson",
    role: "Startup Founder",
    content: "We switched from multiple tools to TaskForce. It's simplified our workflow and boosted productivity by 40%.",
    avatar: "EW",
  },
  {
    name: "David Kim",
    handle: "@davidkim",
    role: "Engineering Manager",
    content: "The customization options are incredible. We've created a theme that matches our brand perfectly.",
    avatar: "DK",
  },
  {
    name: "Lisa Anderson",
    handle: "@lisaanderson",
    role: "UX Researcher",
    content: "TaskForce gets out of your way and lets you focus on what matters. Best task manager I've used in 10 years.",
    avatar: "LA",
  },
  {
    name: "James Miller",
    handle: "@jamesmiller",
    role: "Freelance Designer",
    content: "The attention to detail in the UI is outstanding. Every interaction feels polished and intentional.",
    avatar: "JM",
  },
];

export default function Testimonials() {
  return (
    <section className="relative w-full py-20 md:py-32 bg-muted/30">
      <Container>
        <div className="text-center space-y-4 mb-16">
          <Badge variant="secondary" className="px-4 py-1.5 text-sm font-medium">
            ✦ Testimonials
          </Badge>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight">
            Loved by Teams Worldwide
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            See what professionals are saying about TaskForce
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {testimonials.map((testimonial, index) => (
            <Card
              key={index}
              className="group hover:shadow-lg transition-all duration-300 hover:-translate-y-1"
            >
              <CardContent className="pt-6">
                <div className="flex items-start gap-4 mb-4">
                  <Avatar className="h-12 w-12 border-2 border-primary/20">
                    <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                      {testimonial.avatar}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <div className="font-semibold">{testimonial.name}</div>
                    <div className="text-sm text-muted-foreground">{testimonial.handle}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{testimonial.role}</div>
                  </div>
                  <svg
                    className="h-5 w-5 text-muted-foreground/40 group-hover:text-primary transition-colors"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                  </svg>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  "{testimonial.content}"
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </Container>
    </section>
  );
}
