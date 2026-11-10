match: \b(summar\w*|sum\s+up|recap\w*|overview|brief\s+me|r[ée]sum[ée]\w*|r[ée]capitul\w*|fais\s+le\s+point|point\s+sur|o[uù]\s+en\s+(est|sont|sommes|es)|status\s+of)\b
gestures: list_issues, get_mission, search_brain, add_comment
---
Plan to summarize:
1. An issue: TaskForce gives it below, under "The issue to summarize". Summarize only from it: its title, description, checklist, comments and activity. When it says little (a title, nothing else), say so in one sentence instead of filling in.
2. To put that summary in a comment, call add_comment once with the issue's key and the summary.
3. The board or the project On screen: summarize from On screen. Another project: call list_issues with its name.
4. Group by column: how many issues, what is in progress or blocked, what is done, naming issues by key and title.
5. An issue's mission: call get_mission with its key. A note or a decision: call search_brain.
6. Say only what you were given or the results show: no made-up dates, people, features or progress.
