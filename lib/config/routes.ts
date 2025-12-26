/**
 * Application route definitions
 * Centralized route paths for consistency
 */

export const ROUTES = {
  // Public routes
  HOME: "/",
  LOGIN: "/login",

  // Dashboard routes
  DASHBOARD: "/dashboard",
  DASHBOARD_THREADS: "/dashboard/threads",
  DASHBOARD_MESSAGES: "/dashboard/messages",
  DASHBOARD_SETTINGS: "/dashboard/settings",
  DASHBOARD_SETTINGS_PROFILE: "/dashboard/settings/profile",

  // Admin routes
  ADMIN: "/dashboard/admin",
  ADMIN_REPORTS: "/dashboard/admin/reports",
  ADMIN_MODERATION: "/dashboard/admin/moderation",

  // Thread routes
  THREAD: (slug: string) => `/dashboard/threads/thread/${slug}`,
  THREAD_BY_SLUG: (slug: string) => `/thread/${slug}`,

  // API routes
  API: {
    AUTH: "/api/auth",
    THREADS: "/api/threads",
    UPLOAD: "/api/upload",
    CONVERSATIONS: "/api/conversations",
    NEWSLETTER_GENERATE: "/api/newsletter/generate",
  },
} as const;

