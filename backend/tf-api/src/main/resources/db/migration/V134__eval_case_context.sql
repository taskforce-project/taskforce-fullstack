-- Ce qui entoure la question d'un cas de la banque d'évaluations (R204, séance n°28) : les tours d'avant de la
-- conversation, tels qu'ils étaient, avec ce que chaque réponse a fait. Le 17/11/2026, Cortex niait au tour suivant un
-- projet qu'il venait de créer : un défaut qui ne se voit qu'au tour suivant se rejoue ainsi. En JSON, comme les notes et
-- la cassette ; '{}' pour un cas d'une seule question, ceux d'avant compris.
ALTER TABLE eval_cases ADD COLUMN context TEXT NOT NULL DEFAULT '{}';
