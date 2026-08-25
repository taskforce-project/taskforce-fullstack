-- ============================================================
-- V76 -- Feedback utilisateur (bouton « Give feedback »)
-- ============================================================
-- Stocke les retours envoyés depuis l'app (zones Labs et ailleurs). Écriture seule (pas d'update)
-- → pas d'`updated_at`. Une notif email best-effort part vers l'équipe en parallèle (FeedbackService).

CREATE TABLE feedback (
    id          BIGSERIAL    PRIMARY KEY,
    user_id     BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category    VARCHAR(20)  NOT NULL,        -- BUG | IDEA | OTHER
    message     TEXT         NOT NULL,
    context     VARCHAR(255),                 -- page / fonctionnalité d'origine (ex. « Labs · Intelligence »)
    created_at  TIMESTAMP    NOT NULL DEFAULT now()
);

CREATE INDEX idx_feedback_created_at ON feedback(created_at);
