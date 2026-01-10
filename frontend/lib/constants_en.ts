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
} as const;

export type TranslationKeys = typeof CONSTANTS_EN;
