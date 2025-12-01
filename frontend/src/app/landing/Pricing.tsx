import { motion } from "framer-motion";

// Files
import { Check } from "lucide-react";

// Components
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

const plans = [
  {
    name: "Gratuit",
    price: "0€",
    period: "/mois",
    description: "Parfait pour découvrir l'optimisation IA",
    features: [
      "1 projet à analyser",
      "5 membres d'équipe",
      "Import depuis Trello/Jira",
      "3 suggestions IA/mois",
      "Support par email",
    ],
    cta: "Commencer gratuitement",
    popular: false,
  },
  {
    name: "Pro",
    price: "29€",
    period: "/mois",
    description: "Pour les équipes en croissance",
    features: [
      "Projets illimités",
      "50 membres d'équipe",
      "Analyses IA illimitées",
      "Import multi-sources",
      "Dashboard KPI avancé",
      "Support prioritaire 24/7",
      "Historique complet",
      "Exports personnalisés",
    ],
    cta: "Commencer l'essai gratuit",
    popular: true,
  },
  {
    name: "Entreprise",
    price: "Sur mesure",
    period: "",
    description: "Pour les grandes organisations",
    features: [
      "Tout du plan Pro",
      "Membres illimités",
      "IA personnalisée",
      "Modèles d'analyse custom",
      "Support dédié & SLA",
      "SSO et conformité",
      "Formation équipe",
      "API personnalisée",
    ],
    cta: "Nous contacter",
    popular: false,
  },
];

export function Pricing() {
  return (
    <section id="pricing" className="py-20 px-4 lg:px-8">
      <div className="container mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16 space-y-4"
        >
          <h2 className="text-4xl lg:text-5xl">
            Tarifs Simples et Transparents
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Choisissez le plan qui correspond à vos besoins. Changez ou annulez
            à tout moment.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {plans.map((plan, index) => (
            <motion.div
              key={plan.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.3, delay: 0 }}
              whileHover={{ y: -8 }}
              className="relative"
            >
              {plan.popular && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-10">
                  <span className="bg-[var(--secondary)] text-[var(--text-light)] dark:text-[var(--text-dark)] px-4 py-1 rounded-full">
                    Populaire
                  </span>
                </div>
              )}

              <Card
                className={`h-full ${
                  plan.popular
                    ? "border-[var(--secondary)] shadow-lg"
                    : "border-border"
                }`}
              >
                <CardHeader className="space-y-4 pb-8">
                  <div>
                    <h3 className="text-2xl mb-2">{plan.name}</h3>
                    <p className="text-muted-foreground">{plan.description}</p>
                  </div>

                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl">{plan.price}</span>
                    {plan.period && (
                      <span className="text-muted-foreground">
                        {plan.period}
                      </span>
                    )}
                  </div>
                </CardHeader>

                <CardContent className="space-y-6">
                  <ul className="space-y-3">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-3">
                        <Check className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                        <span className="text-muted-foreground">{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <Button
                    className={`w-full ${
                      plan.popular
                        ? "bg-[var(--secondary)] hover:bg-[var(--secondary)]/90 text-white"
                        : "bg-black hover:bg-black/90 text-white dark:bg-white dark:hover:bg-white/90 dark:text-black"
                    }`}
                    size="lg"
                  >
                    {plan.cta}
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* FAQ or Additional Info */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="text-center mt-12 text-muted-foreground"
        >
          <p>
            Tous les plans incluent une période d&apos;essai de 14 jours. Aucune
            carte bancaire requise.
          </p>
        </motion.div>
      </div>
    </section>
  );
}
