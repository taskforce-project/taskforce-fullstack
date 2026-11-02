match: \b(delete|erase|trash|supprim\w*|suprim\w*|efface\w*)\b|\b(remove|retire\w*|enl[eè]ve\w*|vire\w*)\s+(the\s+|this\s+|l['e]\s*|la\s+|cette\s+)?(issue|ticket|card|carte|task|t[aâ]che|[a-z0-9]+[- ]\d+)
unless: ^\W*(please\s+|peux[- ]tu\s+|tu\s+peux\s+|can\s+you\s+)?(create|add|make|file|open|write|cr[ée]+\w*|ajoute\w*|[ée]cri[st]\w*|fais)\b
gestures: delete_issue, list_issues
---
Plan to delete or archive an issue:
1. Take the issue's key: one the person wrote, the open issue, or the issue On screen they name by its column or its title. Not on screen: list_issues gives it.
2. Call delete_issue once with that key. Not sure which issue: call it without the issue, and TaskForce asks the person.
3. Its card lets the person archive it (it can be undone) or delete it for good. Until they click, nothing is deleted: say so.
Never prepare an issue (create_issue) for a deletion, and never look for a note.
A project, a note or a column is deleted from its own page.
