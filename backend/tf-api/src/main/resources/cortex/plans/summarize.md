match: \b(summar\w*|sum\s+up|recap\w*|overview|brief\s+me|r[ée]sum[ée]\w*|r[ée]capitul\w*|fais\s+le\s+point|point\s+sur|o[uù]\s+en\s+(est|sont|sommes|es)|status\s+of)\b
gestures: list_issues, get_mission, search_brain
---
Plan to summarize:
1. The board or the project On screen: summarize from On screen. Another project: call list_issues with its name.
2. Group by column: how many issues, what is in progress or blocked, what is done, naming issues by key and title.
3. An issue's mission: call get_mission with its key. A note or a decision: call search_brain.
4. Say only what the screen or the results show: no made-up dates, people or progress.
