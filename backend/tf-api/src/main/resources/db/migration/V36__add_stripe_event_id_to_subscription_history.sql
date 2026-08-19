-- Ajout de stripe_event_id sur subscription_history pour garantir l'idempotence des webhooks Stripe.
-- Un événement déjà traité est ignoré via une vérification unique sur cette colonne.
ALTER TABLE subscription_history
    ADD COLUMN IF NOT EXISTS stripe_event_id VARCHAR(100);

CREATE UNIQUE INDEX IF NOT EXISTS idx_subscription_history_stripe_event_id
    ON subscription_history (stripe_event_id)
    WHERE stripe_event_id IS NOT NULL;
