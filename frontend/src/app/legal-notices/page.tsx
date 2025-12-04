"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default function LegalNoticesPage() {
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
          <h1 className="text-4xl font-bold mb-8 text-center">Mentions Légales</h1>
          
          <div className="prose prose-slate dark:prose-invert max-w-none space-y-6">
            <section>
              <h2 className="text-2xl font-semibold mb-4">Définitions</h2>
              <p className="mb-4">
                <strong>Client :</strong> tout professionnel ou personne physique capable au sens des articles 1123 et suivants du Code civil, ou personne morale, qui visite le Site objet des présentes conditions générales.
              </p>
              <p className="mb-4">
                <strong>Prestations et Services :</strong> <a href="https://taskforce-project.fr" className="text-primary hover:underline">https://taskforce-project.fr</a> met à disposition des Clients une plateforme de gestion de projets intelligente avec assignation automatique par IA.
              </p>
              <p className="mb-4">
                <strong>Contenu :</strong> Ensemble des éléments constituant l'information présente sur le Site, notamment textes, images, vidéos.
              </p>
              <p className="mb-4">
                <strong>Informations clients :</strong> Ci-après dénommées « Information(s) » qui correspondent à l'ensemble des données personnelles susceptibles d'être détenues par <a href="https://taskforce-project.fr" className="text-primary hover:underline">https://taskforce-project.fr</a> pour la gestion de votre compte, de la gestion de la relation client et à des fins d'analyses et de statistiques.
              </p>
              <p className="mb-4">
                <strong>Utilisateur :</strong> Internaute se connectant, utilisant le site susnommé.
              </p>
              <p className="mb-4">
                <strong>Informations personnelles :</strong> « Les informations qui permettent, sous quelque forme que ce soit, directement ou non, l'identification des personnes physiques auxquelles elles s'appliquent » (article 4 de la loi n° 78-17 du 6 janvier 1978).
              </p>
              <p className="mb-4">
                Les termes « données à caractère personnel », « personne concernée », « sous-traitant » et « données sensibles » ont le sens défini par le Règlement Général sur la Protection des Données (RGPD : n° 2016-679).
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">1. Présentation du site internet</h2>
              <p className="mb-4">
                En vertu de l'article 6 de la loi n° 2004-575 du 21 juin 2004 pour la confiance dans l'économie numérique, il est précisé aux utilisateurs du site internet <a href="https://taskforce-project.fr" className="text-primary hover:underline">https://taskforce-project.fr</a> l'identité des différents intervenants dans le cadre de sa réalisation et de son suivi :
              </p>
              <div className="bg-muted/50 p-6 rounded-lg space-y-2">
                <p><strong>Propriétaire :</strong> MICHEL Pierre – 12 rue du Lavoir 57000 Metz</p>
                <p><strong>Responsable publication :</strong> MICHEL Pierre – pierre.michel.work@gmail.com</p>
                <p><strong>Webmaster :</strong> MICHEL Pierre – pierre.michel.work@gmail.com</p>
                <p><strong>Hébergeur :</strong> OVH – 2 rue Kellermann 59100 Roubaix</p>
                <p><strong>Délégué à la protection des données :</strong> MICHEL Pierre – pierre.michel.work@gmail.com</p>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">2. Conditions générales d'utilisation du site et des services proposés</h2>
              <p className="mb-4">
                Le Site constitue une œuvre de l'esprit protégée par les dispositions du Code de la Propriété Intellectuelle et des Réglementations Internationales applicables. Le Client ne peut en aucune manière réutiliser, céder ou exploiter pour son propre compte tout ou partie des éléments ou travaux du Site.
              </p>
              <p className="mb-4">
                L'utilisation du site <a href="https://taskforce-project.fr" className="text-primary hover:underline">https://taskforce-project.fr</a> implique l'acceptation pleine et entière des conditions générales d'utilisation ci-après décrites. Ces conditions d'utilisation sont susceptibles d'être modifiées ou complétées à tout moment, les utilisateurs du site sont donc invités à les consulter de manière régulière.
              </p>
              <p className="mb-4">
                Ce site internet est normalement accessible à tout moment aux utilisateurs. Une interruption pour raison de maintenance technique peut être toutefois décidée par TaskForce AI, qui s'efforcera alors de communiquer préalablement aux utilisateurs les dates et heures de l'intervention.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">3. Description des services fournis</h2>
              <p className="mb-4">
                Le site internet <a href="https://taskforce-project.fr" className="text-primary hover:underline">https://taskforce-project.fr</a> a pour objet de fournir une plateforme de gestion de projets avec assignation automatique des tâches par intelligence artificielle.
              </p>
              <p className="mb-4">
                TaskForce AI s'efforce de fournir sur le site des informations aussi précises que possible. Toutefois, il ne pourra être tenu responsable des oublis, des inexactitudes et des carences dans la mise à jour, qu'elles soient de son fait ou du fait des tiers partenaires qui lui fournissent ces informations.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">4. Limitations contractuelles sur les données techniques</h2>
              <p className="mb-4">
                Le site utilise les technologies JavaScript, React et Next.js. Le site Internet ne pourra être tenu responsable de dommages matériels liés à l'utilisation du site. De plus, l'utilisateur du site s'engage à accéder au site en utilisant un matériel récent, ne contenant pas de virus et avec un navigateur de dernière génération mis à jour.
              </p>
              <p className="mb-4">
                Le site <a href="https://taskforce-project.fr" className="text-primary hover:underline">https://taskforce-project.fr</a> est hébergé chez un prestataire sur le territoire de l'Union Européenne conformément aux dispositions du Règlement Général sur la Protection des Données (RGPD : n° 2016-679).
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">5. Propriété intellectuelle et contrefaçons</h2>
              <p className="mb-4">
                TaskForce AI est propriétaire des droits de propriété intellectuelle et détient les droits d'usage sur tous les éléments accessibles sur le site internet, notamment les textes, images, graphismes, logos, vidéos, icônes et sons.
              </p>
              <p className="mb-4">
                Toute reproduction, représentation, modification, publication, adaptation de tout ou partie des éléments du site, quel que soit le moyen ou le procédé utilisé, est interdite, sauf autorisation écrite préalable de TaskForce AI.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">6. Limitations de responsabilité</h2>
              <p className="mb-4">
                TaskForce AI agit en tant qu'éditeur du site et est responsable de la qualité et de la véracité du Contenu qu'il publie.
              </p>
              <p className="mb-4">
                TaskForce AI ne pourra être tenu responsable des dommages directs et indirects causés au matériel de l'utilisateur, lors de l'accès au site internet, et résultant soit de l'utilisation d'un matériel ne répondant pas aux spécifications indiquées, soit de l'apparition d'un bug ou d'une incompatibilité.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">7. Gestion des données personnelles</h2>
              <p className="mb-4">
                Le Client est informé des réglementations concernant la communication marketing, la loi du 21 juin 2014 pour la confiance dans l'Économie Numérique, la Loi Informatique et Liberté du 06 août 2004 ainsi que du Règlement Général sur la Protection des Données (RGPD : n° 2016-679).
              </p>

              <h3 className="text-xl font-semibold mb-3 mt-6">7.1 Responsables de la collecte des données personnelles</h3>
              <p className="mb-4">
                Pour les Données Personnelles collectées dans le cadre de la création du compte personnel de l'Utilisateur et de sa navigation sur le Site, le responsable du traitement des Données Personnelles est : MICHEL Pierre.
              </p>

              <h3 className="text-xl font-semibold mb-3 mt-6">7.2 Finalité des données collectées</h3>
              <p className="mb-4">TaskForce AI est susceptible de traiter tout ou partie des données :</p>
              <ul className="list-disc ml-6 space-y-2 mb-4">
                <li>pour permettre la navigation sur le Site et la gestion et la traçabilité des prestations et services commandés par l'utilisateur</li>
                <li>pour prévenir et lutter contre la fraude informatique (spamming, hacking…)</li>
                <li>pour améliorer la navigation sur le Site</li>
                <li>pour mener des enquêtes de satisfaction facultatives</li>
                <li>pour mener des campagnes de communication (email, notifications)</li>
              </ul>
              <p className="mb-4">
                TaskForce AI ne commercialise pas vos données personnelles qui sont donc uniquement utilisées par nécessité ou à des fins statistiques et d'analyses.
              </p>

              <h3 className="text-xl font-semibold mb-3 mt-6">7.3 Droit d'accès, de rectification et d'opposition</h3>
              <p className="mb-4">
                Conformément à la réglementation européenne en vigueur, les Utilisateurs disposent des droits suivants :
              </p>
              <ul className="list-disc ml-6 space-y-2 mb-4">
                <li>droit d'accès (article 15 RGPD) et de rectification (article 16 RGPD)</li>
                <li>droit de retirer à tout moment un consentement (article 13-2c RGPD)</li>
                <li>droit à la limitation du traitement des données (article 18 RGPD)</li>
                <li>droit d'opposition au traitement des données (article 21 RGPD)</li>
                <li>droit à la portabilité des données (article 20 RGPD)</li>
                <li>droit de définir le sort des données après leur mort</li>
              </ul>

              <h3 className="text-xl font-semibold mb-3 mt-6">7.4 Types de données collectées</h3>
              <div className="bg-muted/50 p-6 rounded-lg mb-4">
                <p className="mb-2"><strong>Données essentielles :</strong></p>
                <p className="mb-4">Nom, Prénom, Email, Mot de passe (hashé), Numéro de téléphone (optionnel), Entreprise (optionnel)</p>
                <p className="mb-2"><strong>Données d'amélioration de l'expérience :</strong></p>
                <p>Préférences utilisateur (thème, langue, paramètres d'interface)</p>
              </div>
              <p className="mb-4">
                Ces données sont conservées pour une période maximale de 9 mois après la fin de la relation contractuelle.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">8. Notification d'incident</h2>
              <p className="mb-4">
                Quels que soient les efforts fournis, aucune méthode de transmission sur Internet et aucune méthode de stockage électronique n'est complètement sûre. Nous ne pouvons en conséquence pas garantir une sécurité absolue.
              </p>
              <p className="mb-4">
                Si nous prenions connaissance d'une brèche de la sécurité, nous avertirions les utilisateurs concernés afin qu'ils puissent prendre les mesures appropriées.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">9. Cookies</h2>
              <p className="mb-4">
                Le site TaskForce AI peut être amené à vous demander l'acceptation des cookies pour des besoins de statistiques et d'affichage. Un cookie est une information déposée sur votre disque dur par le serveur du site que vous visitez.
              </p>
              <p className="mb-4">
                Vous pouvez désactiver l'usage des cookies via votre navigateur. Cependant, certaines fonctionnalités du site pourraient ne plus être accessibles.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-4">10. Droit applicable et attribution de juridiction</h2>
              <p className="mb-4">
                Tout litige en relation avec l'utilisation du site <a href="https://taskforce-project.fr" className="text-primary hover:underline">https://taskforce-project.fr</a> est soumis au droit français.
              </p>
              <p className="mb-4">
                En dehors des cas où la loi ne le permet pas, il est fait attribution exclusive de juridiction aux tribunaux compétents de Metz.
              </p>
            </section>

            <section className="mt-8 p-6 bg-primary/5 border border-primary/20 rounded-lg">
              <h3 className="text-lg font-semibold mb-2">Contact</h3>
              <p className="mb-2">
                Pour toute question concernant ces mentions légales, vous pouvez nous contacter :
              </p>
              <p className="text-sm">
                <strong>Email :</strong> pierre.michel.work@gmail.com<br />
                <strong>Adresse :</strong> 12 rue du Lavoir, 57000 Metz, France
              </p>
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
