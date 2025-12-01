// Components
import { Button } from "@/components/ui/button";
import { ArrowRight, Play } from "lucide-react";
import { motion } from "framer-motion";
import { ImageWithFallback } from "../../../public/landing/ImageWithFallback";

export function Hero() {
  return (
    <section className="pt-32 pb-20 px-4 lg:px-8 relative overflow-hidden">
      <div className="container mx-auto">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left Content */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="space-y-8"
          >
            <div className="space-y-4">
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.6, delay: 0.2 }}
                className="inline-block px-4 py-2 rounded-full bg-accent"
              >
                <span className="text-accent-foreground">
                  ✨ Propulsé par l&apos;IA
                </span>
              </motion.div>

              <h1 className="text-5xl lg:text-6xl">
                Optimisez vos projets avec l&apos;IA
              </h1>

              <p className="text-xl text-muted-foreground">
                Analysez la répartition des tâches, importez vos boards
                existants, et laissez notre IA vous proposer une organisation
                plus efficace. Gagnez du temps, équilibrez les charges.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-4">
              <Button
                size="lg"
                className="bg-primary text-primary-foreground hover:bg-primary/90 group"
              >
                Analyser mon projet
                <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
              </Button>

              <Button size="lg" variant="outline" className="gap-2">
                <Play className="h-5 w-5" />
                Voir la démo
              </Button>
            </div>

            {/* Stats */}
            <div className="flex flex-wrap gap-8 pt-8 border-t border-border">
              <div>
                <div className="text-3xl">5K+</div>
                <p className="text-muted-foreground">Projets optimisés</p>
              </div>
              <div>
                <div className="text-3xl">40%</div>
                <p className="text-muted-foreground">Gain de temps moyen</p>
              </div>
              <div>
                <div className="text-3xl">95%</div>
                <p className="text-muted-foreground">Équilibrage amélioré</p>
              </div>
            </div>
          </motion.div>

          {/* Right Image */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="relative"
          >
            <div className="relative rounded-2xl overflow-hidden shadow-2xl border border-border">
              <ImageWithFallback
                src="https://images.unsplash.com/photo-1611224885990-ab7363d1f2a9?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxrYW5iYW4lMjBib2FyZCUyMHByb2plY3QlMjBtYW5hZ2VtZW50fGVufDF8fHx8MTc2MDYyNDcwM3ww&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral"
                alt="TaskForce AI Dashboard"
                className="w-full h-auto"
              />

              {/* Floating Cards */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.8 }}
                className="absolute top-4 right-4 bg-card p-4 rounded-lg shadow-lg border border-border backdrop-blur-sm"
              >
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                  <span className="text-card-foreground">AI Active</span>
                </div>
              </motion.div>
            </div>

            {/* Background Gradient */}
            <div className="absolute -z-10 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-primary/10 rounded-full blur-3xl"></div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
