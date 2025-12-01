import { motion } from "framer-motion";

// Files
import { Upload, Brain, Lightbulb, Kanban, BarChart3 } from "lucide-react";

// Components
import { Card, CardContent } from "@/components/ui/card";

const features = [
  {
    icon: Upload,
    title: "Import Multi-Sources",
    description:
      "Importez facilement vos boards depuis Trello, Jira, GitHub Projects ou un fichier CSV. Gardez votre historique et vos données.",
  },
  {
    icon: Brain,
    title: "Analyse IA Intelligente",
    description:
      "Notre IA analyse la charge de travail de chaque membre, leurs compétences et l'historique des tâches pour comprendre votre équipe.",
  },
  {
    icon: Lightbulb,
    title: "Suggestions d'Optimisation",
    description:
      "Recevez des suggestions automatiques de réaffectation des tâches pour équilibrer la charge et optimiser l'efficacité.",
  },
  {
    icon: Kanban,
    title: "Gestionnaire Kanban Intégré",
    description:
      "Créez et gérez vos projets directement dans l'app avec un gestionnaire Kanban moderne et intuitif.",
  },
  {
    icon: BarChart3,
    title: "Dashboard KPI Complet",
    description:
      "Suivez la performance, la vélocité, les blocages et tous vos indicateurs clés en temps réel.",
  },
];

export function Features() {
  return (
    <section id="features" className="py-20 px-4 lg:px-8 bg-muted/30">
      <div className="container mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16 space-y-4"
        >
          <h2 className="text-4xl lg:text-5xl">Fonctionnalités Puissantes</h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            De l&apos;import de vos projets existants à l&apos;optimisation
            intelligente, tout pour maximiser l&apos;efficacité de vos équipes.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.3, delay: 0 }}
                whileHover={{ y: -8 }}
              >
                <Card className="h-full border-border hover:border-primary/50 transition-all duration-300 cursor-pointer group">
                  <CardContent className="p-6 space-y-4">
                    <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                      <Icon className="h-6 w-6 text-primary" />
                    </div>

                    <h3 className="text-xl">{feature.title}</h3>

                    <p className="text-muted-foreground">
                      {feature.description}
                    </p>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
