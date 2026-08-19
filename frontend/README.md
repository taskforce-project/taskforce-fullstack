# Frontend - TaskForce AI

Application web moderne de gestion de tâches basée sur Next.js 16 avec React 19.

## 🚀 Structure du projet

### Pages d'authentification

- **`/auth/login`** - Page de connexion
- **`/auth/register`** - Page d'inscription (3 étapes)
- **`/auth/forgot-password`** - Réinitialisation du mot de passe

### Architecture

```
app/
├── auth/
│   ├── layout.tsx              # Layout d'authentification avec thème et langue
│   ├── login/
│   │   ├── LoginForm.tsx       # Formulaire de connexion
│   │   └── page.tsx            # Page de connexion
│   ├── register/
│   │   ├── RegisterForm.tsx    # Formulaire principal d'inscription
│   │   ├── RegisterStep1.tsx   # Étape 1 : Infos personnelles
│   │   ├── RegisterStep2.tsx   # Étape 2 : Organisation
│   │   ├── RegisterStep3.tsx   # Étape 3 : Confirmation
│   │   └── page.tsx            # Page d'inscription avec progression
│   └── forgot-password/
│       └── page.tsx            # Page mot de passe oublié
├── layout.tsx                  # Layout racine
└── page.tsx                    # Redirection vers login

lib/
├── constants_en.ts             # Traductions anglaises
├── constants_fr.ts             # Traductions françaises
└── store/
    └── preferences-store.ts    # Store Zustand pour préférences utilisateur
```

## 🎨 Fonctionnalités

### Gestion des préférences (Zustand)
- **Thème** : Clair / Sombre avec persistance localStorage
- **Langue** : Français / Anglais
- **Accessibilité** :
  - Réduction des animations
  - Taille de police (normal, large, x-large)
  - Mode contraste élevé

### Authentification

#### Login
- Champs : Email, Mot de passe
- Option "Se souvenir de moi"
- Lien "Mot de passe oublié"
- Validation en temps réel
- Gestion d'erreurs avec toast (Sonner)

#### Register (Multi-étapes)
- **Étape 1** : Prénom, Nom, Email, Mot de passe, Confirmation, Conditions
- **Étape 2** : Organisation, Rôle, Taille d'équipe, Secteur
- **Étape 3** : Récapitulatif + Information essai gratuit 14 jours
- Indicateur de progression visuel
- Navigation avant/arrière entre les étapes
- Validation par étape

#### Forgot Password
- Envoi de lien de réinitialisation par email
- Page de confirmation

## 🛠️ Technologies

- **Framework** : Next.js 16 (App Router)
- **React** : 19.2.3
- **State Management** : Zustand 5.0.9
- **UI Components** : Radix UI + shadcn/ui
- **Styling** : Tailwind CSS 4
- **Forms** : React Hook Form + Zod (à intégrer)
- **Notifications** : Sonner
- **Icons** : Lucide React
- **Fonts** : Roboto, Roboto Serif, Roboto Mono

## 🎨 Design

Design moderne inspiré de :
- shadcn/ui
- Vercel
- Next.js

Charte graphique :
- Couleur primaire : Rouge bordeaux (#9b2c2c)
- Couleur secondaire : Beige (#fdf2d6)
- Background : Beige clair (#faf7f5)
- Typographie : Roboto

## 🌍 Internationalisation

Deux fichiers de constantes :
- `constants_en.ts` - Anglais
- `constants_fr.ts` - Français

Langue par défaut : Français

## 📱 Responsive

- Design mobile-first
- Breakpoints Tailwind standard
- Navigation adaptative

## 🔐 Sécurité

- Validation côté client (à compléter côté serveur)
- Passwords avec confirmation
- Protection CSRF (à implémenter)
- Headers de sécurité (à configurer)

## 🚧 À faire

- [ ] Connexion API Backend (Axios + TanStack Query)
- [ ] OAuth (Google, GitHub)
- [ ] Vérification email
- [ ] Gestion des sessions
- [ ] Tests unitaires et E2E
- [ ] Intégration Stripe pour paiements
- [ ] Dashboard principal
- [ ] Gestion des boards (style Trello)

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
