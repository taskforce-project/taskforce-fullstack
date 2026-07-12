# Configuration Stripe — facturation par siège (par membre/mois)

TaskForce facture les forfaits payants **par siège** : la quantité facturée = **nombre de membres
distincts** sur les workspaces du compte (propriétaire). Le code est prêt ; il ne reste qu'à créer les
produits/prix côté Stripe et à renseigner 5 variables d'environnement.

## 1. Créer les produits & prix (Dashboard Stripe → Product catalog)

Crée **2 produits** avec un **prix récurrent mensuel, facturé par unité (per seat)** :

| Produit    | Prix conseillé (indicatif) | Modèle de tarification                     |
|------------|----------------------------|--------------------------------------------|
| Basic      | 10 € / membre / mois       | *Recurring · Monthly · Per unit (quantity)*|
| Business   | 16 € / membre / mois       | *Recurring · Monthly · Per unit (quantity)*|

- Coche **« Usage is metered? » → Non** (on envoie nous‑mêmes la quantité = nb de membres).
- Facultatif : ajoute un **prix annuel** (−17 %) sur chaque produit si tu veux activer le toggle annuel
  (il faudra alors exposer les 2 price‑ids ; le back n'en gère qu'un pour l'instant — voir §5).
- Récupère les **Price ID** (`price_...`) de chaque prix mensuel.

Enterprise reste **sur devis** (pas de self‑service) : pas de prix à créer, le bouton renvoie vers
`mailto:sales@taskforce.dev`.

## 2. Clés API & webhook

- **Clés** : Dashboard → Developers → API keys → `Secret key` (`sk_...`) et `Publishable key` (`pk_...`).
- **Webhook** : Developers → Webhooks → *Add endpoint* :
  - URL : `https://<ton-domaine>/api/stripe/webhook` (en local, via Stripe CLI, voir §4).
  - Événements : `checkout.session.completed`, `customer.subscription.updated`,
    `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`.
  - Récupère le **Signing secret** (`whsec_...`).

## 3. Variables d'environnement (`.env.dev`)

```env
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLIC_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID_BASIC=price_...        # prix mensuel per‑seat du produit Basic
STRIPE_PRICE_ID_BUSINESS=price_...     # prix mensuel per‑seat du produit Business
```

Ces variables sont lues par `application-dev.yml` (`stripe.plans.{basic,business}.price-id`) puis
injectées dans `StripeService`/`StripeConfig`. Après modif : `docker compose -f docker-compose.dev.yml up -d backend`.

## 4. Tester en local (Stripe CLI)

```bash
stripe login
stripe listen --forward-to localhost:8080/api/stripe/webhook   # affiche le whsec_ à mettre dans .env.dev
# Dans l'app : /<workspace>/billing → « Passer à Business » → paiement test (carte 4242 4242 4242 4242)
```

## 5. Ce que fait le code (déjà prêt)

- **`POST /api/billing/checkout`** (authentifié) : résout le compte, calcule les **sièges**
  (`WorkspaceMemberRepository.countDistinctMembersByOwnerId`), crée/réutilise le client Stripe, puis une
  session Checkout `SUBSCRIPTION` avec **`quantity = nb de membres`** (`StripeService.createCheckoutSession(..., seats, ...)`).
- **Front** : `stripe-service.createCheckoutSession("BASIC"|"BUSINESS")` → cette route → redirige vers `session.url`.
- **Webhook** (`StripeWebhookService`) : met à jour `PlanStatus` + `SubscriptionHistory`.

### Reste à faire (hors périmètre de ce lot)
- **Facturation annuelle réelle** : le toggle « Facturé annuellement » de la page est visuel ; pour le
  brancher, créer les prix annuels et passer le bon price‑id au checkout (ajouter `STRIPE_PRICE_ID_*_YEARLY`).
- **Ajustement du nombre de sièges** quand un membre rejoint/part (proration) : à gérer via le portail
  Stripe ou un `Subscription.update` sur changement d'effectif.
