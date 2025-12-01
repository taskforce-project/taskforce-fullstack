import { motion } from "framer-motion";

// Files
import { Upload, Brain, CheckCircle } from "lucide-react";

// Components
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const steps = [
  {
    icon: Upload,
    step: "Étape 1",
    title: "Importez vos tâches",
    description:
      "Connectez votre Trello, Jira, ou importez un CSV. Vous pouvez aussi créer un nouveau projet directement dans l'app.",
  },
  {
    icon: Brain,
    step: "Étape 2",
    title: "L'IA analyse et optimise",
    description:
      "Notre intelligence artificielle analyse la charge de travail, les compétences de l'équipe et propose une répartition optimale.",
  },
  {
    icon: CheckCircle,
    step: "Étape 3",
    title: "Visualisez et gagnez du temps",
    description:
      "Consultez vos projets optimisés, validez les suggestions et suivez vos KPIs en temps réel pour une productivité maximale.",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="py-20 px-4 lg:px-8">
      <div className="container mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16 space-y-4"
        >
          <h2 className="text-4xl lg:text-5xl">Comment ça marche ?</h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Trois étapes simples pour optimiser vos projets et booster la
            productivité de votre équipe.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto relative">
          {/* Connection Lines - Desktop */}
          <div className="hidden md:block absolute top-24 left-0 right-0 h-0.5 bg-border -z-10">
            <div className="h-full bg-primary w-0 animate-pulse"></div>
          </div>

          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <motion.div
                key={step.step}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.3, delay: 0 }}
                className="relative"
              >
                <Card className="h-full border-[var(--border)] hover:border-primary/50 transition-all duration-300">
                  <CardContent className="p-8 space-y-4">
                    {/* Icon Circle */}
                    <div className="relative">
                      <div className="w-16 h-16 rounded-full bg-foreground/10 flex items-center justify-center mx-auto relative z-10">
                        <Icon className="h-8 w-8 text-light" />
                      </div>

                      {/* Step Number Badge */}
                      <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-[var(--secondary)] text-[var(--text-light)] dark:text-[var(--text-dark)] flex items-center justify-center">
                        {index + 1}
                      </div>
                    </div>

                    {/* Content */}
                    <div className="text-center space-y-2">
                      <div className="text-sm text-[var(--text-dark)]">
                        {step.step}
                      </div>
                      <h3 className="text-xl">{step.title}</h3>
                      <p className="text-muted-foreground">
                        {step.description}
                      </p>
                    </div>
                  </CardContent>
                </Card>

                {/* Arrow for mobile */}
                {index < steps.length - 1 && (
                  <div className="md:hidden flex justify-center my-4">
                    <div className="w-0.5 h-8 bg-border"></div>
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.6 }}
          className="text-center mt-12"
        >
          <Button className="px-8 py-3 bg-primary text-[var(--text-light)] rounded-lg hover:bg-primary/90 transition-colors">
            Commencer l&apos;optimisation
          </Button>
        </motion.div>
      </div>
    </section>
  );
}
