match: \b(create|make|start|set\s+up|new|cr[ée]+\w*|nouveau|nouvelle|lance\w*|monte\w*|d[ée]marre\w*)\b.{0,40}\b(projects?|projets?)\b
unless: \b(issues?|tickets?|t[aâ]ches?|tasks?|bugs?|notes?|cards?|cartes?)\b
gestures: create_project
---
Plan to create a project:
1. Call create_project once. Pass name only if the person gave one in their words, and stack if they say what it is built with (Next.js, Spring, a mobile app). Never make up a name.
2. TaskForce asks the person what is missing, one question at a time: the name, then where its code lives (a new private or public repository, an existing one, or none). Never ask these yourself.
3. Say the project exists only when the result says it was created.
Never prepare an issue (create_issue) for a project.
