"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  FolderKanban,
  Check,
  Sparkles,
  Building2,
  Users,
  Zap,
  ArrowLeft,
  Loader2,
} from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";

interface User {
  name: string;
  email: string;
  role: string;
  plan: string;
  company?: string;
}

interface AuthProps {
  onLogin: (user: User) => void;
}

interface Plan {
  id: string;
  name: string;
  price: string;
  description: string;
  features: string[];
  icon: React.ElementType;
  popular?: boolean;
}

const plans: Plan[] = [
  {
    id: "free",
    name: "Free",
    price: "0€",
    description: "Pour découvrir la plateforme",
    icon: Zap,
    features: [
      "1 projet actif",
      "5 utilisateurs maximum",
      "Kanban basique",
      "Support par email",
      "Stockage 1 GB",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price: "29€",
    description: "Pour les équipes en croissance",
    icon: Sparkles,
    popular: true,
    features: [
      "Projets illimités",
      "20 utilisateurs maximum",
      "Assignation IA automatique",
      "Support prioritaire",
      "Stockage 50 GB",
      "Analytiques avancées",
      "Intégrations tierces",
    ],
  },
  {
    id: "enterprise",
    name: "Entreprise",
    price: "99€",
    description: "Pour les grandes organisations",
    icon: Building2,
    features: [
      "Tout illimité",
      "Utilisateurs illimités",
      "IA avancée personnalisée",
      "Support dédié 24/7",
      "Stockage illimité",
      "API personnalisée",
      "SSO & sécurité avancée",
      "Formation sur mesure",
    ],
  },
];

export function Authentication({ onLogin }: Readonly<AuthProps>) {
  const [activeTab, setActiveTab] = useState("login");
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  const [registerName, setRegisterName] = useState("");
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [registerCompany, setRegisterCompany] = useState("");
  const [selectedPlan, setSelectedPlan] = useState("pro");
  const [acceptTerms, setAcceptTerms] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  // Gérer l'ancre dans l'URL
  useState(() => {
    if (typeof window !== "undefined") {
      const hash = window.location.hash.replace("#", "");
      if (hash === "login" || hash === "register") {
        setActiveTab(hash);
      }
    }
  });

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    // Simulate login
    setTimeout(() => {
      const user = {
        name: "Marie Dubois",
        email: loginEmail,
        role: "Admin",
        plan: "pro",
      };
      toast.success("Connexion réussie !");
      onLogin(user);
      setIsLoading(false);
    }, 1000);
  };

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();

    if (!acceptTerms) {
      toast.error("Veuillez accepter les conditions d'utilisation");
      return;
    }

    setIsLoading(true);

    // Simulate registration
    setTimeout(() => {
      toast.success(
        `Compte créé avec succès ! Un code de vérification a été envoyé à ${registerEmail}`
      );
      setIsLoading(false);
      
      // Rediriger vers la page de vérification email
      router.push(`/verify-email?email=${encodeURIComponent(registerEmail)}`);
    }, 1500);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-secondary/5 p-4 py-24">
      <Button
        variant="outline"
        className="fixed top-6 left-6 z-50"
        onClick={() => router.back()}
      >
        <ArrowLeft className="w-4 h-4 mr-2" />
        Retour
      </Button>
      <div className="w-full max-w-6xl my-8">
        <div className="text-center mb-8">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center justify-center gap-3 mb-4"
          >
            <div className="w-20 h-20 rounded-xl flex items-center justify-center shadow-lg">
              <Image
                src="/favicon.ico"
                alt="TaskForce AI Logo"
                width={80}
                height={80}
                className="w-20 h-20 rounded-md"
              />
            </div>
          </motion.div>
          <motion.h1
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-4xl mb-2"
          >
            TaskForce AI
          </motion.h1>
          <motion.p
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="text-muted-foreground text-lg"
          >
            Gestion de projets intelligente avec assignation automatique par IA
          </motion.p>
        </div>

        <motion.div
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="w-full"
          >
            <TabsList className="grid w-full max-w-md mx-auto grid-cols-2">
              <TabsTrigger className="cursor-pointer" value="login">
                Connexion
              </TabsTrigger>
              <TabsTrigger className="cursor-pointer" value="register">
                Créer un compte
              </TabsTrigger>
            </TabsList>

            {/* Login Tab */}
            <TabsContent value="login">
              <Card className="max-w-md mx-auto">
                <CardHeader>
                  <CardTitle>Connexion</CardTitle>
                  <CardDescription>
                    Connectez-vous à votre compte TaskForce AI
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleLogin} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="login-email">Email</Label>
                      <Input
                        id="login-email"
                        type="email"
                        placeholder="nom@entreprise.com"
                        value={loginEmail}
                        onChange={(e) => setLoginEmail(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="login-password">Mot de passe</Label>
                      <Input
                        id="login-password"
                        type="password"
                        placeholder="••••••••"
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        required
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <Checkbox id="remember" />
                        <label
                          htmlFor="remember"
                          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                        >
                          Se souvenir de moi
                        </label>
                      </div>
                      <Button variant="link" size="sm" className="px-0">
                        Mot de passe oublié ?
                      </Button>
                    </div>
                    <Button
                      type="submit"
                      className="w-full"
                      disabled={isLoading}
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Connexion...
                        </>
                      ) : (
                        "Se connecter"
                      )}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Register Tab */}
            <TabsContent value="register">
              <div className="space-y-6">
                {/* Registration Form */}
                <Card className="max-w-4xl mx-auto">
                  <CardHeader>
                    <CardTitle>Créer un compte</CardTitle>
                    <CardDescription>
                      Rejoignez TaskForce AI et choisissez votre plan
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={handleRegister} className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="register-name">Nom complet</Label>
                          <Input
                            id="register-name"
                            placeholder="Jean Dupont"
                            value={registerName}
                            onChange={(e) => setRegisterName(e.target.value)}
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="register-email">Email</Label>
                          <Input
                            id="register-email"
                            type="email"
                            placeholder="jean@entreprise.com"
                            value={registerEmail}
                            onChange={(e) => setRegisterEmail(e.target.value)}
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="register-password">
                            Mot de passe
                          </Label>
                          <Input
                            id="register-password"
                            type="password"
                            placeholder="••••••••"
                            value={registerPassword}
                            onChange={(e) =>
                              setRegisterPassword(e.target.value)
                            }
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="register-company">
                            Entreprise (optionnel)
                          </Label>
                          <Input
                            id="register-company"
                            placeholder="Mon Entreprise"
                            value={registerCompany}
                            onChange={(e) => setRegisterCompany(e.target.value)}
                          />
                        </div>
                      </div>

                      {/* Plan Selection */}
                      <div className="space-y-4">
                        <div>
                          <Label>Choisissez votre plan</Label>
                          <p className="text-sm text-muted-foreground mt-1">
                            Vous pouvez changer de plan à tout moment
                          </p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          {plans.map((plan) => {
                            const Icon = plan.icon;
                            const isSelected = selectedPlan === plan.id;

                            return (
                              <motion.div
                                key={plan.id}
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                              >
                                <Card
                                  className={`cursor-pointer transition-all relative ${
                                    isSelected
                                      ? "border-primary shadow-lg ring-2 ring-primary"
                                      : "hover:border-primary/50"
                                  }`}
                                  onClick={() => setSelectedPlan(plan.id)}
                                >
                                  {plan.popular && (
                                    <Badge className="absolute -top-2 right-4 bg-secondary">
                                      Populaire
                                    </Badge>
                                  )}
                                  <CardHeader className="pb-4">
                                    <div className="flex items-center gap-3 mb-2">
                                      <div
                                        className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                                          isSelected
                                            ? "bg-primary text-primary-foreground"
                                            : "bg-muted"
                                        }`}
                                      >
                                        <Icon className="w-5 h-5" />
                                      </div>
                                      {isSelected && (
                                        <div className="ml-auto w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                                          <Check className="w-4 h-4 text-primary-foreground" />
                                        </div>
                                      )}
                                    </div>
                                    <CardTitle>{plan.name}</CardTitle>
                                    <div className="flex items-baseline gap-1">
                                      <span className="text-3xl">
                                        {plan.price}
                                      </span>
                                      {plan.price !== "0€" && (
                                        <span className="text-muted-foreground">
                                          /mois
                                        </span>
                                      )}
                                    </div>
                                    <CardDescription>
                                      {plan.description}
                                    </CardDescription>
                                  </CardHeader>
                                  <CardContent>
                                    <ul className="space-y-2">
                                      {plan.features.map((feature, idx) => (
                                        <li
                                          key={idx}
                                          className="flex items-start gap-2 text-sm"
                                        >
                                          <Check className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                                          <span>{feature}</span>
                                        </li>
                                      ))}
                                    </ul>
                                  </CardContent>
                                </Card>
                              </motion.div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Terms and Submit */}
                      <div className="space-y-4">
                        <div className="flex items-start space-x-2">
                          <Checkbox
                            id="terms"
                            checked={acceptTerms}
                            onCheckedChange={(checked) =>
                              setAcceptTerms(checked as boolean)
                            }
                          />
                          <label
                            htmlFor="terms"
                            className="text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                          >
                            J&apos;accepte les{" "}
                            <a
                              href="/legal-notices"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:underline"
                            >
                              conditions d&apos;utilisation
                            </a>{" "}
                            et la{" "}
                            <a
                              href="/privacy-policy"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:underline"
                            >
                              politique de confidentialité
                            </a>
                          </label>
                        </div>

                        <Button
                          type="submit"
                          className="w-full"
                          size="lg"
                          disabled={isLoading}
                        >
                          {isLoading ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              Création du compte...
                            </>
                          ) : (
                            `Créer mon compte ${
                              plans.find((p) => p.id === selectedPlan)?.name
                            }`
                          )}
                        </Button>
                      </div>
                    </form>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </motion.div>
      </div>
    </div>
  );
}
