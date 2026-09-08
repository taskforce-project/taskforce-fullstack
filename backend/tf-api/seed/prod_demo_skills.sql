-- =====================================================================
-- TaskForce - Enrichit les profils de competences des coequipiers demo
-- =====================================================================
-- But : des profils DISTINCTS et alignes sur les domaines des issues (TF)
--       pour que Smart Assign recommande des personnes VARIEES (front->Sarah,
--       back->Marcus, IA->Nina, infra->Tom...) et pas tout sur Aicha (fullstack).
--
-- Le score semantique Smart Assign est calcule EN LIVE par Groq a partir de
-- profile_text + skills_json (pas d'embedding stocke) -> un UPDATE SQL suffit.
--
-- Idempotent. Prerequis : prod_demo_seed.sql applique (workspace 'demo' + profils).
-- Lancer (VM1) : docker exec -i taskforce-postgres-prod psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" < prod_demo_skills.sql
-- =====================================================================

DO $sk$
DECLARE
    v_ws BIGINT;
    n    INT := 0;
BEGIN
    SELECT id INTO v_ws FROM workspaces WHERE slug = 'demo';
    IF v_ws IS NULL THEN
        RAISE EXCEPTION 'Workspace demo introuvable - lance d abord prod_demo_seed.sql';
    END IF;

    WITH profiles(email, txt, skills, sen, capacity) AS (VALUES
        ('sarah.chen@seed.taskforce.dev',
         'Frontend lead. React and Next.js expert, TypeScript, design systems, accessibility and UI polish. Owns the web app, reusable components, loading and error states.',
         '["frontend","react","typescript","nextjs","css","ui","ux"]', 'LEAD', 38),
        ('marcus.webb@seed.taskforce.dev',
         'Senior backend engineer. Java and Spring Boot, application security (OWASP, JWT auth, rate limiting), GDPR, Stripe billing integration, performance and PostgreSQL data model.',
         '["backend","java","spring","sql","api","securite","rgpd","billing"]', 'SENIOR', 40),
        ('nina.volkov@seed.taskforce.dev',
         'Data and AI engineer. LLM integration (Groq, Ollama), embeddings and RAG, Smart Assign scoring, MCP agents, analytics and data pipelines.',
         '["ia","ai","python","ml","llm","data","api"]', 'SENIOR', 32),
        ('tom.berg@seed.taskforce.dev',
         'DevOps and platform. Docker, GitHub Actions CI/CD, two-VM deployment, Prometheus and Grafana monitoring, networking and reliability.',
         '["infra","devops","docker","ci-cd","kubernetes","monitoring"]', 'SENIOR', 40),
        ('aicha.diallo@seed.taskforce.dev',
         'Versatile full-stack developer, comfortable on both the React front-end and the Java/Spring back-end. Cross-team support on mixed features.',
         '["fullstack","react","java","api"]', 'MID', 35),
        ('lina.park@seed.taskforce.dev',
         'Product designer. UX, UI, design system, Figma prototyping and user journeys.',
         '["ux","design","ui","figma"]', 'MID', 32),
        ('omar.haddad@seed.taskforce.dev',
         'QA and test automation engineer. End-to-end tests, regression, quality gates.',
         '["testing","qa","automation"]', 'MID', 35),
        ('diego.santos@seed.taskforce.dev',
         'Junior front-end developer, growing on HTML, CSS and React.',
         '["frontend","html","css","react"]', 'JUNIOR', 40)
    )
    UPDATE member_skill_profiles p
       SET profile_text            = pr.txt,
           skills_json             = pr.skills::jsonb,
           seniority               = pr.sen,
           capacity_hours_per_week = pr.capacity,
           updated_at              = NOW()
      FROM profiles pr
      JOIN users u ON lower(u.email) = pr.email
     WHERE p.workspace_id = v_ws AND p.user_id = u.id;

    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE 'Profils de competences demo enrichis : % coequipiers (front/back/IA/infra/design/QA distincts) pour un Smart Assign varie.', n;
END
$sk$;
