-- Une demande d'accord dit en mots ce que l'agent veut faire et pourquoi on la pose (R78, séance n°13) : l'action
-- jugée (web.search, shell, git.push...) et la règle qui demande, avec sa raison. Un accord peut valoir pour toute la
-- mission (R46) : la portée de la décision, ONCE ou MISSION. Vides pour une demande d'un runner plus ancien.
ALTER TABLE delivery_run_approvals
    ADD COLUMN action      VARCHAR(40),
    ADD COLUMN rule_id     VARCHAR(120),
    ADD COLUMN rule_reason VARCHAR(500),
    ADD COLUMN scope       VARCHAR(16);
