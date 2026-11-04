match: (what('s|\s+has|\s+have)?\s+(changed|happened|moved)|what('s|\s+is)\s+new|recent\s+changes|changes\s+(this|last|since)|qu['e]?\s*est[- ]ce\s+qu[i']\s*(a|s'est)\s+(chang|pass|boug)\w*|quoi\s+de\s+(neuf|nouveau)|ce\s+qui\s+a\s+(chang|boug)\w*|quels?\s+changements?|les\s+changements)
gestures: list_issues
---
Plan to say what changed:
1. Call list_issues with the project (the one On screen, or the one named) and changedInDays: 7 for this week, 1 for today.
2. Tell only what the result shows: each issue created or changed in that time, by its key, its title and its column.
3. A deletion leaves no trace there: never say an issue was deleted, moved or created unless the result shows it.
Nothing in the result: say that nothing changed in that time.
