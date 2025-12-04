"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default function PrivacyPolicyPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5 py-24 px-4">
      <Button
        variant="outline"
        className="fixed top-6 left-6 z-50"
        onClick={() => router.back()}
      >
        <ArrowLeft className="w-4 h-4 mr-2" />
        Retour
      </Button>
      <div className="container mx-auto max-w-4xl">
        <div className="bg-background/80 backdrop-blur-sm rounded-2xl shadow-xl p-8 md:p-12 border border-border">
          <h1 className="text-4xl font-bold mb-8 text-center">Politique de Confidentialité</h1>
          
          <div className="prose prose-slate dark:prose-invert max-w-none space-y-6">
            <section>
              <h2 className="text-2xl font-semibold mb-4">Introduction</h2>
              <p className="mb-4">
                TaskForce AI s&apos;engage à protéger la vie privée de ses utilisateurs. Cette politique de confidentialité explique comment nous collectons, utilisons et protégeons vos données personnelles conformément au Règlement Général sur la Protection des Données (RGPD).
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">1. Données collectées</h2>
              
              <h3 className="text-xl font-semibold mb-3 mt-6">1.1 Données d&apos;identification</h3>
              <ul className="list-disc ml-6 space-y-2 mb-4">
                <li>Nom et prénom</li>
                <li>Adresse email</li>
                <li>Mot de passe (crypté)</li>
                <li>Numéro de téléphone (optionnel)</li>
                <li>Nom de l&apos;entreprise (optionnel)</li>
              </ul>

              <h3 className="text-xl font-semibold mb-3 mt-6">1.2 Données d&apos;utilisation</h3>
              <ul className="list-disc ml-6 space-y-2 mb-4">
                <li>Données de connexion (adresse IP, date et heure)</li>
                <li>Données de navigation (pages visitées, durée de session)</li>
                <li>Préférences utilisateur (thème, langue)</li>
                <li>Historique des projets et tâches</li>
              </ul>

              <h3 className="text-xl font-semibold mb-3 mt-6">1.3 Données techniques</h3>
              <ul className="list-disc ml-6 space-y-2 mb-4">
                <li>Type de navigateur</li>
                <li>Système d&apos;exploitation</li>
                <li>Type d&apos;appareil</li>
                <li>Résolution d&apos;écran</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">2. Finalités du traitement</h2>
              <p className="mb-4">Vos données sont collectées pour les finalités suivantes :</p>
              <ul className="list-disc ml-6 space-y-2 mb-4">
                <li><strong>Gestion de votre compte :</strong> création, authentification, gestion de profil</li>
                <li><strong>Fourniture des services :</strong> gestion de projets, assignation de tâches par IA</li>
                <li><strong>Amélioration de nos services :</strong> analyses statistiques, optimisation de l&apos;expérience utilisateur</li>
                <li><strong>Communication :</strong> notifications importantes, support client, newsletters (avec votre consentement)</li>
                <li><strong>Sécurité :</strong> prévention de la fraude, protection contre les cyberattaques</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">3. Base légale du traitement</h2>
              <p className="mb-4">Le traitement de vos données repose sur :</p>
              <ul className="list-disc ml-6 space-y-2 mb-4">
                <li><strong>Votre consentement :</strong> pour les newsletters et communications marketing</li>
                <li><strong>L&apos;exécution du contrat :</strong> pour la fourniture des services</li>
                <li><strong>Nos intérêts légitimes :</strong> pour l&apos;amélioration de nos services et la sécurité</li>
                <li><strong>Les obligations légales :</strong> pour la conformité réglementaire</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">4. Durée de conservation</h2>
              <div className="bg-muted/50 p-6 rounded-lg space-y-3 mb-4">
                <p><strong>Données de compte actif :</strong> Pendant toute la durée d&apos;utilisation du service</p>
                <p><strong>Données de compte inactif :</strong> 3 ans après la dernière connexion</p>
                <p><strong>Données de facturation :</strong> 10 ans (obligation légale)</p>
                <p><strong>Logs de connexion :</strong> 1 an</p>
                <p><strong>Données marketing :</strong> 3 ans ou jusqu&apos;au retrait du consentement</p>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">5. Partage des données</h2>
              <p className="mb-4">
                TaskForce AI ne vend ni ne loue vos données personnelles. Vos données peuvent être partagées uniquement avec :
              </p>
              <ul className="list-disc ml-6 space-y-2 mb-4">
                <li><strong>Nos sous-traitants :</strong> hébergement (OVH), services d&apos;email, outils d&apos;analyse</li>
                <li><strong>Les autorités :</strong> sur demande légale ou pour protéger nos droits</li>
                <li><strong>Membres de votre équipe :</strong> dans le cadre de projets collaboratifs</li>
              </ul>
              <p className="mb-4">
                Tous nos partenaires sont soumis à des obligations strictes de confidentialité et de sécurité.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">6. Transferts internationaux</h2>
              <p className="mb-4">
                Vos données sont hébergées au sein de l&apos;Union Européenne. En cas de transfert hors UE, nous nous assurons que des garanties appropriées sont en place (clauses contractuelles types, Privacy Shield).
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">7. Vos droits</h2>
              <p className="mb-4">Conformément au RGPD, vous disposez des droits suivants :</p>
              <ul className="list-disc ml-6 space-y-2 mb-4">
                <li><strong>Droit d&apos;accès :</strong> obtenir une copie de vos données</li>
                <li><strong>Droit de rectification :</strong> corriger vos données inexactes</li>
                <li><strong>Droit à l&apos;effacement :</strong> supprimer vos données (« droit à l&apos;oubli »)</li>
                <li><strong>Droit à la limitation :</strong> restreindre le traitement de vos données</li>
                <li><strong>Droit d&apos;opposition :</strong> vous opposer au traitement de vos données</li>
                <li><strong>Droit à la portabilité :</strong> récupérer vos données dans un format structuré</li>
                <li><strong>Droit de retrait du consentement :</strong> à tout moment pour les traitements basés sur le consentement</li>
              </ul>
              <div className="bg-primary/5 border border-primary/20 p-6 rounded-lg mt-4">
                <p className="font-semibold mb-2">Pour exercer vos droits :</p>
                <p>Email : pierre.michel.work@gmail.com</p>
                <p>Adresse : 12 rue du Lavoir, 57000 Metz, France</p>
                <p className="text-sm mt-2">Délai de réponse : 1 mois maximum</p>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">8. Sécurité des données</h2>
              <p className="mb-4">Nous mettons en œuvre des mesures de sécurité techniques et organisationnelles :</p>
              <ul className="list-disc ml-6 space-y-2 mb-4">
                <li>Cryptage des données en transit (HTTPS/SSL)</li>
                <li>Cryptage des mots de passe (bcrypt)</li>
                <li>Authentification à deux facteurs (2FA) disponible</li>
                <li>Pare-feu et systèmes de détection d&apos;intrusion</li>
                <li>Sauvegardes régulières et chiffrées</li>
                <li>Accès restreint aux données personnelles</li>
                <li>Formation régulière de nos équipes</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">9. Cookies</h2>
              <p className="mb-4">
                Notre site utilise des cookies pour améliorer votre expérience. Vous pouvez gérer vos préférences de cookies dans les paramètres de votre navigateur.
              </p>
              <p className="mb-4">Types de cookies utilisés :</p>
              <ul className="list-disc ml-6 space-y-2 mb-4">
                <li><strong>Cookies essentiels :</strong> nécessaires au fonctionnement du site</li>
                <li><strong>Cookies de performance :</strong> pour analyser l&apos;utilisation du site</li>
                <li><strong>Cookies de préférence :</strong> pour mémoriser vos paramètres</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">10. Modifications</h2>
              <p className="mb-4">
                Nous nous réservons le droit de modifier cette politique de confidentialité à tout moment. Les modifications seront publiées sur cette page avec une date de mise à jour. Nous vous encourageons à consulter régulièrement cette page.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">11. Réclamations</h2>
              <p className="mb-4">
                Si vous estimez que vos droits ne sont pas respectés, vous pouvez déposer une réclamation auprès de la CNIL (Commission Nationale de l&apos;Informatique et des Libertés) :
              </p>
              <div className="bg-muted/50 p-6 rounded-lg">
                <p><strong>CNIL</strong></p>
                <p>3 Place de Fontenoy - TSA 80715</p>
                <p>75334 PARIS CEDEX 07</p>
                <p>Téléphone : 01 53 73 22 22</p>
                <p>Site web : <a href="https://www.cnil.fr" className="text-primary hover:underline">www.cnil.fr</a></p>
              </div>
            </section>

            <p className="text-sm text-muted-foreground mt-8 text-center">
              Dernière mise à jour : Décembre 2025
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
