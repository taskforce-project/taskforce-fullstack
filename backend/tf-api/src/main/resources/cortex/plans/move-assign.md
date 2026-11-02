match: \b(move|assign\w*|reassign\w*|unassign\w*|d[ée]pla[cç]\w*|bouge\w*|mets|met|passe[rz]?|assigne\w*|r[ée]assigne\w*|d[ée]sassigne\w*|attribue\w*|confie\w*)\b
unless: ^\W*(please\s+|peux[- ]tu\s+|tu\s+peux\s+|can\s+you\s+)?(create|add|make|file|open|write|cr[ée]+\w*|ajoute\w*|[ée]cri[st]\w*|fais)\b
gestures: update_issue, delegate_issue, list_issues
---
Plan to move or assign an issue:
1. Take the issue's key: one the person wrote, the open issue, or the issue On screen they name by its column or its title.
2. Call update_issue once with that key and only what changes: status, a column named On screen; assignee, "me" for the person asking, a member's name, or "none".
3. It is done at once and the person can undo it. A column or a person you are not sure of: pass what they said, and TaskForce asks.
To hand the issue to Claude Code, call delegate_issue instead: the person approves it on its card.
