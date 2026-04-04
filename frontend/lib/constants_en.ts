// English translations for TaskForce AI

export const CONSTANTS_EN = {
  // Common
  common: {
    appName: "Taskforce",
    language: "Language",
    theme: "Theme",
    light: "Light",
    dark: "Dark",
    loading: "Loading...",
    error: "Error",
    success: "Success",
    cancel: "Cancel",
    confirm: "Confirm",
    close: "Close",
    save: "Save",
    delete: "Delete",
    edit: "Edit",
    back: "Back",
    next: "Next",
    previous: "Previous",
    finish: "Finish",
    or: "or",
    search: "Search...",
    notifications: "Notifications",
    logout: "Log out",
    noResults: "No results found",
    viewAll: "View all",
    createNew: "Create",
    filter: "Filter",
    sort: "Sort by",
    export: "Export",
    required: "Required",
    optional: "Optional",
    comingSoon: "Coming soon",
    free: "Free",
    pro: "Pro",
    enterprise: "Enterprise",
    upgrade: "Upgrade",
    learnMore: "Learn more",
  },

  // Authentication - Login
  auth: {
    login: {
      title: "Welcome back",
      subtitle: "Sign in to your account to continue",
      emailLabel: "Email address",
      emailPlaceholder: "Enter your email",
      passwordLabel: "Password",
      passwordPlaceholder: "Enter your password",
      rememberMe: "Remember me",
      forgotPassword: "Forgot password?",
      signInButton: "Sign in",
      noAccount: "Don't have an account?",
      signUpLink: "Sign up",
      signInWithGoogle: "Sign in with Google",
      signInWithGithub: "Sign in with GitHub",
      dividerText: "Or continue with",
    },

    // Authentication - Register
    register: {
      title: "Create your account",
      subtitle: "Start your free trial today",
      alreadyHaveAccount: "Already have an account?",
      signInLink: "Sign in",
      
      // Step 1: Personal Information
      step1: {
        title: "Personal information",
        subtitle: "Let's get started with your basic details",
        firstNameLabel: "First name",
        firstNamePlaceholder: "Enter your first name",
        lastNameLabel: "Last name",
        lastNamePlaceholder: "Enter your last name",
        emailLabel: "Email address",
        emailPlaceholder: "Enter your email",
        passwordLabel: "Password",
        passwordPlaceholder: "Create a password",
        confirmPasswordLabel: "Confirm password",
        confirmPasswordPlaceholder: "Confirm your password",
        acceptTerms: "I agree to the",
        termsLink: "Terms of Service",
        and: "and",
        privacyLink: "Privacy Policy",
      },

      // Step 2: Organization
      step2: {
        title: "Organization details",
        subtitle: "Tell us about your organization",
        organizationNameLabel: "Organization name",
        organizationNamePlaceholder: "Enter your organization name",
        roleLabel: "Your role",
        rolePlaceholder: "Select your role",
        teamSizeLabel: "Team size",
        teamSizePlaceholder: "Select team size",
        industryLabel: "Industry",
        industryPlaceholder: "Select your industry",
        
        roles: {
          owner: "Owner",
          admin: "Admin",
          manager: "Manager",
          member: "Team Member",
          other: "Other",
        },
        
        teamSizes: {
          solo: "Just me",
          small: "2-10 people",
          medium: "11-50 people",
          large: "51-200 people",
          enterprise: "200+ people",
        },
        
        industries: {
          technology: "Technology",
          finance: "Finance",
          healthcare: "Healthcare",
          education: "Education",
          retail: "Retail",
          manufacturing: "Manufacturing",
          other: "Other",
        },
      },

      // Step 3: Confirmation
      step3: {
        title: "You're all set!",
        subtitle: "Review your information and start your free trial",
        reviewTitle: "Review your details",
        personalInfo: "Personal information",
        organizationInfo: "Organization",
        freeTrialTitle: "Free trial included",
        freeTrialDescription: "Start with a 14-day free trial. No credit card required.",
        createAccountButton: "Create account",
        startTrialButton: "Start free trial",
      },

      // Progress Indicator
      progress: {
        step1: "Personal",
        step2: "Organization",
        step3: "Confirm",
      },
    },

    // Password Reset
    passwordReset: {
      title: "Reset your password",
      subtitle: "Enter your email to receive a reset link",
      emailLabel: "Email address",
      emailPlaceholder: "Enter your email",
      sendLinkButton: "Send reset link",
      backToLogin: "Back to login",
      checkEmail: "Check your email",
      checkEmailDescription: "We've sent a password reset link to your email address.",
    },

    // Errors
    errors: {
      invalidEmail: "Please enter a valid email address",
      emailRequired: "Email is required",
      passwordRequired: "Password is required",
      passwordTooShort: "Password must be at least 8 characters",
      passwordsDoNotMatch: "Passwords do not match",
      firstNameRequired: "First name is required",
      lastNameRequired: "Last name is required",
      organizationRequired: "Organization name is required",
      roleRequired: "Role is required",
      termsRequired: "You must accept the terms and conditions",
      loginFailed: "Invalid email or password",
      registrationFailed: "Registration failed. Please try again.",
      networkError: "Network error. Please check your connection.",
      unexpectedError: "An unexpected error occurred. Please try again.",
      emailAlreadyExists: "This email is already registered",
    },

    // Success Messages
    success: {
      loginSuccess: "Successfully signed in!",
      registrationSuccess: "Account created successfully!",
      passwordResetSent: "Password reset link sent to your email",
      emailVerified: "Email verified successfully",
    },
  },

  // Accessibility
  accessibility: {
    toggleTheme: "Toggle theme",
    changeLanguage: "Change language",
    openMenu: "Open menu",
    closeMenu: "Close menu",
    skipToContent: "Skip to main content",
  },

  // Navigation (sidebar)
  nav: {
    dashboard: "Dashboard",
    myWork: "My Work",
    inbox: "Inbox",
    projects: "Projects",
    issues: "Issues",
    teams: "Teams",
    members: "Members",
    skills: "Skills",
    analytics: "Analytics",
    discussions: "Discussions",
    settings: "Settings",
    help: "Help & Docs",
    createProject: "New Project",
    sub: {
      myIssues: "My Issues",
      myCycles: "My Cycles",
      myPages: "My Pages",
      allNotifications: "All",
      mentions: "Mentions",
      alerts: "Alerts",
      assignments: "Assignments",
    },
  },

  // Dashboard page
  dashboard: {
    title: "Dashboard",
    welcomeBack: "Welcome back",
    stats: {
      activeProjects: "Active Projects",
      openIssues: "Open Issues",
      myTasks: "My Tasks",
      teamMembers: "Members",
      completedThisWeek: "Completed this week",
      overloaded: "Overloaded",
    },
    activity: {
      title: "Recent Activity",
      empty: "No recent activity",
      viewAll: "View all activity",
    },
    quickActions: {
      title: "Quick Actions",
      createProject: "New Project",
      createIssue: "New Issue",
      inviteMember: "Invite Member",
    },
    workload: {
      title: "Team Workload",
      noData: "No workload data available",
      overloaded: "Overloaded",
      available: "Available",
      capacity: "capacity",
    },
  },

  // Projects list page
  projects: {
    title: "Projects",
    subtitle: "All your workspace projects",
    newProject: "New Project",
    searchPlaceholder: "Search projects...",
    empty: {
      title: "No projects yet",
      description: "Create your first project to get started",
      cta: "Create project",
    },
    emptySearch: "No projects match your search",
    status: {
      active: "Active",
      archived: "Archived",
      paused: "Paused",
    },
    meta: {
      issues: "issues",
      members: "members",
      updatedAt: "Updated",
      progress: "Progress",
    },
    filters: {
      all: "All",
      active: "Active",
      archived: "Archived",
    },
    detail: {
      board: "Board",
      list: "List",
      backlog: "Backlog",
      issues: "Issues",
      cycles: "Cycles",
      pages: "Pages",
      members: "Members",
      settings: "Settings",
      newIssue: "New Issue",
      noIssues: "No issues in this column",
      addIssue: "Add issue",
    },
  },

  // My Work page
  myWork: {
    title: "My Work",
    subtitle: "Your assigned issues, cycles, and pages",
    tabs: {
      issues: "My Issues",
      cycles: "My Cycles",
      pages: "My Pages",
    },
    empty: {
      issues: "No issues assigned to you",
      cycles: "You're not part of any active cycle",
      pages: "You haven't created any pages yet",
      description: "New items will appear here once assigned",
    },
    issues: {
      priority: "Priority",
      status: "Status",
      dueDate: "Due date",
      project: "Project",
      noDue: "No due date",
    },
    cycles: {
      active: "Active",
      upcoming: "Upcoming",
      completed: "Completed",
      progress: "Progress",
      issues: "issues",
      endsIn: "Ends in",
      startedAgo: "Started",
    },
    pages: {
      lastEdited: "Last edited",
      by: "by",
      viewPage: "View page",
    },
  },

  // Inbox page
  inbox: {
    title: "Inbox",
    subtitle: "Stay on top of your notifications",
    tabs: {
      all: "All",
      mentions: "Mentions",
      alerts: "Alerts",
      assignments: "Assignments",
    },
    empty: {
      all: "You're all caught up!",
      mentions: "No mentions yet",
      alerts: "No alerts",
      assignments: "No assignments",
      description: "New notifications will appear here",
    },
    markAllRead: "Mark all as read",
    markRead: "Mark as read",
    unread: "Unread",
    types: {
      mention: "mentioned you",
      assigned: "assigned you to",
      commented: "commented on",
      statusChanged: "changed status of",
      dueSoon: "Due soon",
      overdue: "Overdue",
      completed: "completed",
    },
  },

  analytics: {
    title: "Analytics",
    subtitle: "Track your team's performance and project health.",
    upgradeTitle: "Unlock Analytics",
    upgradeDesc: "Detailed charts, velocity tracking, and team workload insights are available on the Pro plan.",
    overview: "Overview",
    velocity: "Velocity",
    workload: "Team Workload",
    progress: "Project Progress",
    issuesCreated: "Issues created",
    issuesCompleted: "Issues completed",
    cyclesCompleted: "Cycles completed",
    activeProjects: "Active projects",
    thisMonth: "this month",
    vsLastMonth: "vs last month",
    completionRate: "Completion rate",
    avgCycleTime: "Avg. cycle time",
    days: "days",
  },

  settings: {
    title: "Settings",
    profile: "Profile",
    account: "Account",
    notifications: "Notifications",
    billing: "Billing",
    team: "Team",
    displayName: "Display name",
    email: "Email",
    language: "Language",
    theme: "Theme",
    currentPlan: "Current plan",
    upgrade: "Upgrade plan",
    dangerZone: "Danger Zone",
    deleteAccount: "Delete account",
    deleteAccountDesc: "Permanently delete your account and all data. This cannot be undone.",
    saveChanges: "Save changes",
    saved: "Saved!",
  },

  help: {
    title: "Help & Docs",
    subtitle: "Find answers, guides, and resources.",
    searchPlaceholder: "Search docs, guides, FAQs…",
    categories: "Categories",
    gettingStarted: "Getting Started",
    gettingStartedDesc: "Set up your workspace, invite your team, create your first project.",
    projects: "Projects & Issues",
    projectsDesc: "Learn how to organize work with projects, issues, cycles, and backlogs.",
    integrations: "Integrations",
    integrationsDesc: "Connect Taskforce with GitHub, Slack, Jira, and more.",
    security: "Security & Permissions",
    securityDesc: "Manage roles, SSO, audit logs, and data retention policies.",
    billing: "Billing & Plans",
    billingDesc: "Understand your plan, manage subscriptions, and view invoices.",
    contactSupport: "Contact support",
    contactSupportDesc: "Can't find what you're looking for? Our team is here to help.",
    openChat: "Open chat",
    sendEmail: "Send email",
    popularArticles: "Popular articles",
    articles: {
      a1: "How to create your first issue",
      a2: "Setting up cycles and sprints",
      a3: "Using the kanban board",
      a4: "Inviting team members",
      a5: "Configuring notifications",
    },
  },
} as const

// Type récursif pour transformer les literal types en string
type DeepStringify<T> = {
  [K in keyof T]: T[K] extends string
    ? string
    : T[K] extends object
    ? DeepStringify<T[K]>
    : T[K];
};

export type TranslationKeys = DeepStringify<typeof CONSTANTS_EN>;
