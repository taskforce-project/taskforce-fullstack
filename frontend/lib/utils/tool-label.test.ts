import { describe, expect, it } from "vitest"

import { toolLabel } from "./tool-label"

describe("toolLabel", () => {
  it.each([
    ["list_issues", "", "List issues"],
    ["save_comment", "Linear", "Save comment"],
    ["notion-search", "Notion", "Search"],
    ["notion-create-pages", "Notion", "Create pages"],
    ["getJiraIssue", "Jira", "Get Jira issue"],
    ["searchJiraIssuesUsingJql", "Jira", "Search Jira issues using jql"],
    ["slack_get_file_upload_url", "Slack", "Get file upload url"],
    ["issues.create", "", "Issues create"],
    ["Linear", "Linear", "Linear"],
    ["___", "", "___"],
  ])("reads %s (%s) as %s", (name, connector, label) => {
    expect(toolLabel(name, connector)).toBe(label)
  })
})
