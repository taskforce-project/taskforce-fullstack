// Traductions françaises pour TaskForce AI

import type { TranslationKeys } from "./constants_en";

export const CONSTANTS_FR: TranslationKeys = {
  // Commun
  common: {
    appName: "TaskForce AI",
    language: "Langue",
    theme: "Thème",
    light: "Clair",
    dark: "Sombre",
    loading: "Chargement...",
    error: "Erreur",
    success: "Succès",
    cancel: "Annuler",
    confirm: "Confirmer",
    close: "Fermer",
    save: "Enregistrer",
    delete: "Supprimer",
    edit: "Modifier",
    back: "Retour",
    next: "Suivant",
    previous: "Précédent",
    finish: "Terminer",
    or: "ou",
  },

  // Authentification - Connexion
  auth: {
    login: {
      title: "Bon retour",
      subtitle: "Connectez-vous à votre compte pour continuer",
      emailLabel: "Adresse email",
      emailPlaceholder: "Entrez votre email",
      passwordLabel: "Mot de passe",
      passwordPlaceholder: "Entrez votre mot de passe",
      rememberMe: "Se souvenir de moi",
      forgotPassword: "Mot de passe oublié ?",
      signInButton: "Se connecter",
      noAccount: "Pas encore de compte ?",
      signUpLink: "S'inscrire",
      signInWithGoogle: "Continuer avec Google",
      signInWithGithub: "Continuer avec GitHub",
      dividerText: "Ou continuer avec",
    },

    // Authentification - Inscription
    register: {
      title: "Créez votre compte",
      subtitle: "Commencez votre essai gratuit dès aujourd'hui",
      alreadyHaveAccount: "Vous avez déjà un compte ?",
      signInLink: "Se connecter",
      
      // Étape 1 : Informations personnelles
      step1: {
        title: "Informations personnelles",
        subtitle: "Commençons par vos informations de base",
        firstNameLabel: "Prénom",
        firstNamePlaceholder: "Entrez votre prénom",
        lastNameLabel: "Nom",
        lastNamePlaceholder: "Entrez votre nom",
        emailLabel: "Adresse email",
        emailPlaceholder: "Entrez votre email",
        passwordLabel: "Mot de passe",
        passwordPlaceholder: "Créez un mot de passe",
        confirmPasswordLabel: "Confirmez le mot de passe",
        confirmPasswordPlaceholder: "Confirmez votre mot de passe",
        acceptTerms: "J'accepte les",
        termsLink: "Conditions d'utilisation",
        and: "et la",
        privacyLink: "Politique de confidentialité",
      },

      // Étape 2 : Organisation
      step2: {
        title: "Détails de l'organisation",
        subtitle: "Parlez-nous de votre organisation",
        organizationNameLabel: "Nom de l'organisation",
        organizationNamePlaceholder: "Entrez le nom de votre organisation",
        roleLabel: "Votre rôle",
        rolePlaceholder: "Sélectionnez votre rôle",
        teamSizeLabel: "Taille de l'équipe",
        teamSizePlaceholder: "Sélectionnez la taille de l'équipe",
        industryLabel: "Secteur d'activité",
        industryPlaceholder: "Sélectionnez votre secteur",
        
        roles: {
          owner: "Propriétaire",
          admin: "Administrateur",
          manager: "Manager",
          member: "Membre de l'équipe",
          other: "Autre",
        },
        
        teamSizes: {
          solo: "Juste moi",
          small: "2-10 personnes",
          medium: "11-50 personnes",
          large: "51-200 personnes",
          enterprise: "200+ personnes",
        },
        
        industries: {
          technology: "Technologie",
          finance: "Finance",
          healthcare: "Santé",
          education: "Éducation",
          retail: "Commerce",
          manufacturing: "Industrie",
          other: "Autre",
        },
      },

      // Étape 3 : Confirmation
      step3: {
        title: "Tout est prêt !",
        subtitle: "Vérifiez vos informations et commencez votre essai gratuit",
        reviewTitle: "Vérifiez vos informations",
        personalInfo: "Informations personnelles",
        organizationInfo: "Organisation",
        freeTrialTitle: "Essai gratuit inclus",
        freeTrialDescription: "Commencez avec un essai gratuit de 14 jours. Aucune carte bancaire requise.",
        createAccountButton: "Créer le compte",
        startTrialButton: "Commencer l'essai gratuit",
      },

      // Indicateur de progression
      progress: {
        step1: "Personnel",
        step2: "Organisation",
        step3: "Confirmer",
      },
    },

    // Réinitialisation du mot de passe
    passwordReset: {
      title: "Réinitialisez votre mot de passe",
      subtitle: "Entrez votre email pour recevoir un lien de réinitialisation",
      emailLabel: "Adresse email",
      emailPlaceholder: "Entrez votre email",
      sendLinkButton: "Envoyer le lien",
      backToLogin: "Retour à la connexion",
      checkEmail: "Vérifiez vos emails",
      checkEmailDescription: "Nous avons envoyé un lien de réinitialisation à votre adresse email.",
    },

    // Erreurs
    errors: {
      invalidEmail: "Veuillez entrer une adresse email valide",
      emailRequired: "L'email est requis",
      passwordRequired: "Le mot de passe est requis",
      passwordTooShort: "Le mot de passe doit contenir au moins 8 caractères",
      passwordsDoNotMatch: "Les mots de passe ne correspondent pas",
      firstNameRequired: "Le prénom est requis",
      lastNameRequired: "Le nom est requis",
      organizationRequired: "Le nom de l'organisation est requis",
      roleRequired: "Le rôle est requis",
      termsRequired: "Vous devez accepter les conditions d'utilisation",
      loginFailed: "Email ou mot de passe incorrect",
      registrationFailed: "L'inscription a échoué. Veuillez réessayer.",
      networkError: "Erreur réseau. Veuillez vérifier votre connexion.",
      unexpectedError: "Une erreur inattendue s'est produite. Veuillez réessayer.",
      emailAlreadyExists: "Cet email est déjà enregistré",
    },

    // Messages de succès
    success: {
      loginSuccess: "Connexion réussie !",
      registrationSuccess: "Compte créé avec succès !",
      passwordResetSent: "Lien de réinitialisation envoyé à votre email",
      emailVerified: "Email vérifié avec succès",
    },
  },

  // Accessibilité
  accessibility: {
    toggleTheme: "Changer de thème",
    changeLanguage: "Changer de langue",
    openMenu: "Ouvrir le menu",
    closeMenu: "Fermer le menu",
    skipToContent: "Aller au contenu principal",
  },
} as const;
