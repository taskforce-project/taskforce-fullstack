-- Direction artistique 2026 : la couleur d'accent d'un projet ou d'une équipe est une classe Tailwind
-- stockée telle quelle (V26, V41). La palette passe aux formes pleines du portfolio (bg-shape-*). Les
-- anciennes classes ne figurent plus dans le code du front, Tailwind ne les génère donc plus : sans
-- cette conversion, les projets concernés perdraient leur couleur. Seules les valeurs de l'ancienne
-- palette sont converties ; 'bg-primary' (sans teinte) et toute autre valeur restent inchangées.

UPDATE projects SET color = CASE color
    WHEN 'bg-blue-500'    THEN 'bg-shape-blue'
    WHEN 'bg-indigo-500'  THEN 'bg-shape-blue'
    WHEN 'bg-cyan-500'    THEN 'bg-shape-sky'
    WHEN 'bg-emerald-500' THEN 'bg-shape-green'
    WHEN 'bg-amber-500'   THEN 'bg-shape-yellow'
    WHEN 'bg-orange-500'  THEN 'bg-shape-red'
    WHEN 'bg-violet-500'  THEN 'bg-shape-pink'
    WHEN 'bg-pink-500'    THEN 'bg-shape-pink'
END
WHERE color IN ('bg-blue-500', 'bg-indigo-500', 'bg-cyan-500', 'bg-emerald-500', 'bg-amber-500',
                'bg-orange-500', 'bg-violet-500', 'bg-pink-500');

UPDATE teams SET color = CASE color
    WHEN 'bg-blue-500'    THEN 'bg-shape-blue'
    WHEN 'bg-indigo-500'  THEN 'bg-shape-blue'
    WHEN 'bg-cyan-500'    THEN 'bg-shape-sky'
    WHEN 'bg-emerald-500' THEN 'bg-shape-green'
    WHEN 'bg-amber-500'   THEN 'bg-shape-yellow'
    WHEN 'bg-orange-500'  THEN 'bg-shape-red'
    WHEN 'bg-violet-500'  THEN 'bg-shape-pink'
    WHEN 'bg-pink-500'    THEN 'bg-shape-pink'
END
WHERE color IN ('bg-blue-500', 'bg-indigo-500', 'bg-cyan-500', 'bg-emerald-500', 'bg-amber-500',
                'bg-orange-500', 'bg-violet-500', 'bg-pink-500');
