"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, FileText, Building2, Mail, Server, Shield, Scale, Globe } from "lucide-react";
import { motion } from "framer-motion";

export default function LegalNoticesPage() {
  const router = useRouter();

  const legalInfo = [
    { icon: Building2, label: "Propriétaire", value: "MICHEL Pierre" },
    { icon: Mail, label: "Contact", value: "pierre.michel.work@gmail.com" },
    { icon: Server, label: "Hébergeur", value: "OVH – 2 rue Kellermann, 59100 Roubaix" },
    { icon: Shield, label: "DPO", value: "MICHEL Pierre" },
  ];

  const sections = [
    {
      icon: FileText,
      title: "Présentation du site",
      content: "TaskForce AI est une plateforme de gestion de projets avec assignation automatique des tâches par intelligence artificielle, éditée par MICHEL Pierre, domicilié au 12 rue du Lavoir, 57000 Metz."
    },
    {
      icon: Scale,
      title: "Propriété intellectuelle",
      content: "Le Site constitue une œuvre de l'esprit protégée par les dispositions du Code de la Propriété Intellectuelle. Toute reproduction, représentation ou modification des éléments du site est interdite sans autorisation écrite préalable."
    },
    {
      icon: Globe,
      title: "Données techniques",
      content: "Le site utilise les technologies JavaScript, React et Next.js. Il est hébergé chez OVH sur le territoire de l'Union Européenne conformément aux dispositions du RGPD."
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5">
      <Button
        variant="outline"
        className="fixed top-6 left-6 z-50 backdrop-blur-sm"
        onClick={() => router.back()}
      >
        <ArrowLeft className="w-4 h-4 mr-2" />
        Retour
      </Button>

      {/* Hero Section */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-primary/10 to-secondary/10" />
        <div className="container mx-auto px-4 py-24 relative">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center max-w-3xl mx-auto"
          >
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-primary/10 mb-6">
              <Scale className="w-10 h-10 text-primary" />
            </div>
            <h1 className="text-5xl font-bold mb-6 bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
              Mentions Légales test
            </h1>
            <p className="text-xl text-muted-foreground mb-4">
              Informations légales et réglementaires
            </p>
            <Badge variant="outline" className="text-sm">
              Conforme à la loi n° 2004-575 • Mise à jour : Décembre 2025
            </Badge>
          </motion.div>
        </div>
      </div>

      <div className="container mx-auto px-4 pb-20 max-w-6xl">
        {/* Contact Cards Grid */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16"
        >
          {legalInfo.map((info, idx) => {
            const Icon = info.icon;
            return (
              <Card key={idx} className="group hover:shadow-lg transition-all duration-300 hover:border-primary/50">
                <CardContent className="p-6">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                    <Icon className="w-6 h-6 text-primary" />
                  </div>
                  <p className="text-sm text-muted-foreground mb-2">{info.label}</p>
                  <p className="font-semibold text-sm">{info.value}</p>
                </CardContent>
              </Card>
            );
          })}
        </motion.div>

        {/* Main Sections */}
        <div className="space-y-6 mb-16">
          {sections.map((section, idx) => {
            const Icon = section.icon;
            return (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.3 + idx * 0.1 }}
              >
                <Card className="hover:shadow-lg transition-all duration-300">
                  <CardContent className="p-8">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <Icon className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <h2 className="text-2xl font-bold mb-3">{section.title}</h2>
                        <p className="text-muted-foreground leading-relaxed">{section.content}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>

        {/* Detailed Content Grid */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.6 }}
          className="grid md:grid-cols-2 gap-6 mb-12"
        >
          {/* CGU */}
          <Card>
            <CardContent className="p-8">
              <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                <FileText className="w-5 h-5 text-primary" />
                Conditions d&apos;utilisation
              </h3>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>
                  L&apos;utilisation du site implique l&apos;acceptation pleine et entière des conditions générales d&apos;utilisation.
                </p>
                <p>
                  Ces conditions sont susceptibles d&apos;être modifiées ou complétées à tout moment. Les utilisateurs sont invités à les consulter régulièrement.
                </p>
                <p>
                  Le site est normalement accessible à tout moment. Une interruption pour maintenance technique peut être décidée, avec communication préalable si possible.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Services */}
          <Card>
            <CardContent className="p-8">
              <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                <Building2 className="w-5 h-5 text-primary" />
                Description des services
              </h3>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>
                  TaskForce AI fournit une plateforme de gestion de projets avec assignation automatique des tâches par intelligence artificielle.
                </p>
                <p>
                  Nous nous efforçons de fournir des informations aussi précises que possible, mais ne pourrons être tenus responsables des oublis ou inexactitudes.
                </p>
                <p>
                  Les informations sont données à titre indicatif et sont susceptibles d&apos;évoluer.
                </p>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Responsabilité */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.7 }}
          className="mb-12"
        >
          <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-secondary/5">
            <CardContent className="p-8">
              <h2 className="text-2xl font-bold mb-6 flex items-center gap-3">
                <Shield className="w-7 h-7 text-primary" />
                Limitations de responsabilité
              </h2>
              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="p-4 rounded-lg bg-background/60 backdrop-blur-sm">
                    <h4 className="font-semibold mb-2">Éditeur du site</h4>
                    <p className="text-sm text-muted-foreground">
                      TaskForce AI agit en tant qu&apos;éditeur et est responsable de la qualité et de la véracité du contenu publié.
                    </p>
                  </div>
                  <div className="p-4 rounded-lg bg-background/60 backdrop-blur-sm">
                    <h4 className="font-semibold mb-2">Dommages matériels</h4>
                    <p className="text-sm text-muted-foreground">
                      TaskForce AI ne pourra être tenu responsable des dommages causés au matériel de l&apos;utilisateur lors de l&apos;accès au site.
                    </p>
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="p-4 rounded-lg bg-background/60 backdrop-blur-sm">
                    <h4 className="font-semibold mb-2">Dommages indirects</h4>
                    <p className="text-sm text-muted-foreground">
                      Nous ne pourrons être tenus responsables des dommages indirects (perte de marché, perte de chance) consécutifs à l&apos;utilisation du site.
                    </p>
                  </div>
                  <div className="p-4 rounded-lg bg-background/60 backdrop-blur-sm">
                    <h4 className="font-semibold mb-2">Contenu utilisateur</h4>
                    <p className="text-sm text-muted-foreground">
                      Nous nous réservons le droit de supprimer tout contenu contrevenant à la législation française.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Protection des données */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.8 }}
          className="mb-12"
        >
          <Card>
            <CardContent className="p-8">
              <h2 className="text-2xl font-bold mb-6 flex items-center gap-3">
                <Shield className="w-7 h-7 text-primary" />
                Gestion des données personnelles
              </h2>
              <div className="space-y-4">
                <p className="text-muted-foreground">
                  Le Client est informé des réglementations concernant la communication marketing, la loi du 21 juin 2014 pour la confiance dans l&apos;Économie Numérique, la Loi Informatique et Liberté du 06 août 2004 ainsi que du <span className="text-primary font-semibold">Règlement Général sur la Protection des Données (RGPD : n° 2016-679)</span>.
                </p>
                
                <div className="grid md:grid-cols-2 gap-4 mt-6">
                  <div className="p-4 rounded-lg bg-muted/30">
                    <h4 className="font-semibold mb-2">Responsable du traitement</h4>
                    <p className="text-sm text-muted-foreground">
                      MICHEL Pierre est responsable du traitement des données personnelles collectées sur le site.
                    </p>
                  </div>
                  
                  <div className="p-4 rounded-lg bg-muted/30">
                    <h4 className="font-semibold mb-2">Finalités</h4>
                    <p className="text-sm text-muted-foreground">
                      Navigation, gestion de compte, amélioration des services, prévention de la fraude.
                    </p>
                  </div>
                  
                  <div className="p-4 rounded-lg bg-muted/30">
                    <h4 className="font-semibold mb-2">Conservation</h4>
                    <p className="text-sm text-muted-foreground">
                      Maximum 9 mois après la fin de la relation contractuelle pour les données essentielles.
                    </p>
                  </div>
                  
                  <div className="p-4 rounded-lg bg-muted/30">
                    <h4 className="font-semibold mb-2">Vos droits</h4>
                    <p className="text-sm text-muted-foreground">
                      Accès, rectification, effacement, opposition, portabilité conformément au RGPD.
                    </p>
                  </div>
                </div>

                <div className="p-6 rounded-xl bg-primary/10 border border-primary/20 mt-6">
                  <p className="font-semibold mb-2">Pour plus d&apos;informations sur la protection de vos données :</p>
                  <a href="/privacy-policy" className="text-primary hover:underline transition-colors font-medium">
                    Consultez notre Politique de Confidentialité →
                  </a>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Juridiction */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.9 }}
        >
          <Card className="border-2 border-dashed border-primary/30">
            <CardContent className="p-8 text-center">
              <Scale className="w-12 h-12 text-primary mx-auto mb-4" />
              <h3 className="text-2xl font-bold mb-3">Droit applicable</h3>
              <p className="text-muted-foreground mb-4 max-w-2xl mx-auto">
                Tout litige en relation avec l&apos;utilisation du site est soumis au droit français.
              </p>
              <div className="inline-flex items-center gap-2 bg-muted/50 px-6 py-3 rounded-lg">
                <Building2 className="w-5 h-5 text-primary" />
                <span className="font-medium">Juridiction compétente : Tribunaux de Metz</span>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
