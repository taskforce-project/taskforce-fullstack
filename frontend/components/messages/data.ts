import type { Channel, Member, Message } from "./types"

// ─────────────────────────────────────────────────────────────────────────────
// Members
// ─────────────────────────────────────────────────────────────────────────────

export const MEMBERS: Record<string, Member> = {
  me:     { id: "me",     name: "You",            initials: "ME", color: "bg-primary",     online: true  },
  sophie: { id: "sophie", name: "Sophie Martin",  initials: "SM", color: "bg-violet-500",  online: true  },
  emma:   { id: "emma",   name: "Emma Petit",     initials: "EP", color: "bg-emerald-500", online: false },
  thomas: { id: "thomas", name: "Thomas Bernard", initials: "TB", color: "bg-orange-500",  online: false },
}

// ─────────────────────────────────────────────────────────────────────────────
// Channels
// ─────────────────────────────────────────────────────────────────────────────

export const GENERAL_CHANNELS: Channel[] = [
  { id: "general",       kind: "channel", name: "general",       description: "Company-wide announcements and updates", unread: 3 },
  { id: "announcements", kind: "channel", name: "announcements", description: "Official announcements only" },
  { id: "random",        kind: "channel", name: "random",        description: "Non-work stuff and fun", unread: 1 },
]

export const DM_CHANNELS: Channel[] = [
  { id: "dm-sophie", kind: "dm",       name: "Sophie Martin",  members: ["me", "sophie"], unread: 2 },
  { id: "dm-emma",   kind: "dm",       name: "Emma Petit",     members: ["me", "emma"] },
  { id: "dm-thomas", kind: "dm",       name: "Thomas Bernard", members: ["me", "thomas"] },
  { id: "dm-fe",     kind: "group-dm", name: "Frontend Team",  members: ["me", "sophie", "emma"], unread: 1 },
]

export const PROJECT_GROUPS = [
  {
    id: "tf-app",
    name: "TaskForce App",
    channels: [
      { id: "tf-general",  kind: "project-channel" as const, name: "general",  projectId: "tf-app" },
      { id: "tf-frontend", kind: "project-channel" as const, name: "frontend", projectId: "tf-app", unread: 5 },
      { id: "tf-backend",  kind: "project-channel" as const, name: "backend",  projectId: "tf-app" },
      { id: "tf-design",   kind: "project-channel" as const, name: "design",   projectId: "tf-app" },
    ],
  },
  {
    id: "landing",
    name: "Landing Page",
    channels: [
      { id: "lp-general", kind: "project-channel" as const, name: "general", projectId: "landing" },
      { id: "lp-content", kind: "project-channel" as const, name: "content", projectId: "landing" },
    ],
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// Mock messages
// ─────────────────────────────────────────────────────────────────────────────

function d(h: number, m: number) {
  const now = new Date()
  now.setHours(h, m, 0, 0)
  return now
}

export const MOCK_MESSAGES: Record<string, Message[]> = {
  general: [
    { id: "g1",  authorId: "sophie", content: "Morning everyone! 👋 Quick reminder: sprint review is at 3pm today.", ts: d(9,  2), pinned: true },
    { id: "g2",  authorId: "thomas", content: "Thanks for the heads up Sophie. I'll have the backend demo ready.", ts: d(9, 15) },
    { id: "g3",  authorId: "emma",   content: "Same here, UI is looking great. I'll walk through the new components we shipped.", ts: d(9, 16) },
    { id: "g4",  authorId: "me",     content: "Perfect. I'll prep the slides.", ts: d(9, 44), reactions: [{ emoji: "👍", count: 2, mine: false }] },
    { id: "g5",  authorId: "sophie", content: "Also heads up — the staging env is temporarily down while @thomas deploys the DB migration.", ts: d(10, 3) },
    { id: "g6",  authorId: "thomas", content: "Done! Staging is back up. Flyway ran clean ✅", ts: d(10, 31), reactions: [{ emoji: "🎉", count: 3, mine: true }] },
    { id: "g7",  authorId: "me",     content: "Awesome. Just verified — auth flow is working end-to-end on staging.", ts: d(10, 45) },
    { id: "g8",  authorId: "emma",   content: "Chart colors are 🔥 btw", ts: d(11, 2) },
    { id: "g9",  authorId: "me",     content: "haha thanks — had to fix hsl() → hex, nothing was rendering", ts: d(11, 3) },
    { id: "g10", authorId: "sophie", content: "See you all at 3!", ts: d(11, 20) },
  ],
  "dm-sophie": [
    { id: "ds1", authorId: "sophie", content: "Hey! Do you have 5 minutes to sync on the issue sheet?", ts: d(10, 0) },
    { id: "ds2", authorId: "me",     content: "Sure, go ahead!", ts: d(10, 2) },
    { id: "ds3", authorId: "sophie", content: "The inline editing feels really smooth 👌 I was wondering if we should also allow editing the status directly from the sheet title bar", ts: d(10, 3) },
    { id: "ds4", authorId: "me",     content: "It's already there — click the status badge in the header. Dropdown opens.", ts: d(10, 5) },
    { id: "ds5", authorId: "sophie", content: "Oh nice! I missed that. Works perfectly 🙌", ts: d(10, 6) },
    { id: "ds6", authorId: "sophie", content: "One more thing — any chance we add file attachments to issues?", ts: d(10, 7) },
    { id: "ds7", authorId: "me",     content: "On the list! Let me open an issue for it so we can track it.", ts: d(10, 8) },
  ],
  "dm-fe": [
    { id: "fe1", authorId: "emma",   content: "Quick question for the group — should we use `grid` or `flex` for the settings layout?", ts: d(9, 0) },
    { id: "fe2", authorId: "me",     content: "`grid grid-cols-[180px_1fr]` for form rows, `flex` for the page layout. I went with that in Settings.", ts: d(9, 5) },
    { id: "fe3", authorId: "sophie", content: "Agreed. Consistent with what we do in sheets too.", ts: d(9, 6) },
    { id: "fe4", authorId: "emma",   content: "Perfect, thanks!", ts: d(9, 7) },
  ],
  "tf-frontend": [
    { id: "tf1", authorId: "me",     content: "FYI I'm starting the messages feature today. Slack-style with general channels, DMs and project channels.", ts: d(8, 30) },
    { id: "tf2", authorId: "sophie", content: "Nice! Are we doing per-channel threads?", ts: d(8, 45) },
    { id: "tf3", authorId: "me",     content: "Not in v1, but it's in the backlog. First pass is just flat messages + reactions.", ts: d(8, 46) },
    { id: "tf4", authorId: "emma",   content: "Makes sense. Ship the core, iterate. LGTM 👍", ts: d(8, 50) },
    { id: "tf5", authorId: "me",     content: "Exactly. Also the sidebar layout needed a full-height override — the AppShell adds `p-6` which I'm negating with `-m-6`.", ts: d(9, 0) },
    { id: "tf6", authorId: "sophie", content: "Clever. Same trick as sheets?", ts: d(9, 1) },
    { id: "tf7", authorId: "me",     content: "Similar idea, yeah.", ts: d(9, 2) },
  ],
}

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

export function getMessages(channelId: string): Message[] {
  return MOCK_MESSAGES[channelId] ?? [
    { id: `${channelId}-welcome`, authorId: "sophie", content: `Welcome to #${channelId}! This is the beginning of the conversation.`, ts: new Date() },
  ]
}

export function allChannels(): Channel[] {
  return [
    ...GENERAL_CHANNELS,
    ...DM_CHANNELS,
    ...PROJECT_GROUPS.flatMap((pg) => pg.channels),
  ]
}

export function findChannel(id: string): Channel | undefined {
  return allChannels().find((c) => c.id === id)
}

export function totalUnread(channels: Channel[]): number {
  return channels.reduce((acc, c) => acc + (c.unread ?? 0), 0)
}
