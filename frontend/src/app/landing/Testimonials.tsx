import { motion } from 'framer-motion';

// FIles
import { Star } from 'lucide-react';

// Components
import { Card, CardContent } from '@/components/ui/card';


const testimonials = [
  {
    name: 'Marie Dubois',
    role: 'Chef de Projet',
    company: 'TechCorp',
    content: 'L\'import depuis Jira a été instantané et les suggestions d\'optimisation ont permis de réduire notre backlog de 30%. Impressionnant !',
    rating: 5,
  },
  {
    name: 'Thomas Martin',
    role: 'CTO',
    company: 'StartupXYZ',
    content: 'L\'analyse IA nous a montré des déséquilibres de charge qu\'on n\'avait pas vus. Nos sprints sont maintenant beaucoup plus équilibrés.',
    rating: 5,
  },
  {
    name: 'Sophie Bernard',
    role: 'Product Owner',
    company: 'Digital Agency',
    content: 'Fini les tâches mal assignées ! L\'IA comprend vraiment les compétences de l\'équipe et propose des affectations pertinentes.',
    rating: 5,
  },
];

const clients = [
  'TechCorp',
  'StartupXYZ',
  'Digital Agency',
  'Innovation Labs',
  'Global Solutions',
  'Creative Studio',
];

export function Testimonials() {
  return (
    <section id="about" className="py-20 px-4 lg:px-8 bg-muted/30">
      <div className="container mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16 space-y-4"
        >
          <h2 className="text-4xl lg:text-5xl">
            Ils Nous Font Confiance
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Des équipes qui ont optimisé leurs projets et gagné en efficacité
          </p>
        </motion.div>

        {/* Testimonials Grid */}
        <div className="grid md:grid-cols-3 gap-6 mb-16">
          {testimonials.map((testimonial, index) => (
            <motion.div
              key={testimonial.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
            >
              <Card className="h-full border-border">
                <CardContent className="p-6 space-y-4">
                  {/* Rating */}
                  <div className="flex gap-1">
                    {[...new Array(testimonial.rating)].map((_, i) => (
                      <Star key={i} className="h-4 w-4 fill-yellow-500 text-yellow-500" />
                    ))}
                  </div>

                  {/* Content */}
                  <p className="text-muted-foreground italic">
                    &quot;{testimonial.content}&quot;
                  </p>

                  {/* Author */}
                  <div className="pt-4 border-t border-border">
                    <div className="text-foreground">{testimonial.name}</div>
                    <div className="text-sm text-muted-foreground">
                      {testimonial.role} • {testimonial.company}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Client Logos */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.3, delay: 0 }}
          className="text-center"
        >
          <p className="text-muted-foreground mb-8">Plus de 300 équipes ont optimisé leurs projets avec TaskForce AI</p>
          <div className="flex flex-wrap justify-center items-center gap-8 lg:gap-12">
            {clients.map((client, index) => (
              <motion.div
                key={client}
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: 0.1 * index }}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <div className="px-6 py-3 border border-border rounded-lg bg-card">
                  {client}
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
