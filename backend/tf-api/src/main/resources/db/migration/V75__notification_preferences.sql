-- ============================================================
-- V75 -- Préférences de notification (par utilisateur, par événement)
-- ============================================================
-- De VRAIS réglages, par événement et par canal :
--   * in_app : la notification apparaît dans la cloche + le temps réel (défaut ON)
--   * email  : un email est envoyé si l'utilisateur le souhaite (défaut OFF -> opt-in)
--
-- Modèle « absence = défaut » : on ne seed AUCUNE ligne. Tant qu'aucune ligne
-- n'existe pour (user_id, event_key), le service applique le défaut (in_app=ON, email=OFF).
--   => aucun backfill sur la base installée, et l'ajout d'un événement futur ne casse rien.
-- Une ligne n'est écrite que lorsqu'un utilisateur modifie explicitement un réglage.
--
-- event_key ∈ { assigned, mention, commented, statusChanged, dueDate, overload }
-- (regroupe les 8 `type` de notifications : completed->statusChanged, overdue->dueDate).

CREATE TABLE notification_preferences (
    id          BIGSERIAL    PRIMARY KEY,
    user_id     BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_key   VARCHAR(50)  NOT NULL,
    in_app      BOOLEAN      NOT NULL DEFAULT TRUE,
    email       BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMP    NOT NULL DEFAULT now(),
    updated_at  TIMESTAMP    NOT NULL DEFAULT now(),
    created_by  VARCHAR(255),
    updated_by  VARCHAR(255),
    CONSTRAINT uq_notif_pref_user_event UNIQUE (user_id, event_key)
);

CREATE INDEX idx_notif_pref_user_id ON notification_preferences(user_id);
