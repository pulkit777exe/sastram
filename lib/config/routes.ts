export const ROUTES = {
  HOME: '/',
  LOGIN: '/login',
  DASHBOARD: '/dashboard',
  DASHBOARD_THREADS: '/dashboard/threads',
  DASHBOARD_MESSAGES: '/dashboard/messages',
  DASHBOARD_SETTINGS: '/dashboard/settings',
  DASHBOARD_SETTINGS_PROFILE: '/dashboard/settings/profile',

  ADMIN: '/dashboard/admin',
  ADMIN_REPORTS: '/dashboard/admin/reports',
  ADMIN_MODERATION: '/dashboard/admin/moderation',

  THREAD: (slug: string) => `/dashboard/threads/thread/${slug}`,
  THREAD_BY_SLUG: (slug: string) => `/thread/${slug}`,

  API: {
    AUTH: '/api/auth',
    THREADS: '/api/threads',
    UPLOAD: '/api/upload',
    CONVERSATIONS: '/api/conversations',
    NEWSLETTER_GENERATE: '/api/newsletter/generate',
  },
} as const;
