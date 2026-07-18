export const ROUTES = {
  HOME: '/',
  LOGIN: '/login',
  DASHBOARD: '/dashboard',
  DASHBOARD_THREADS: '/dashboard/threads',
  DASHBOARD_MESSAGES: '/dashboard/messages',
  DASHBOARD_SETTINGS: '/dashboard/settings',
  DASHBOARD_SETTINGS_PROFILE: '/dashboard/settings/profile',
  DASHBOARD_BOOKMARKS: '/dashboard/bookmarks',

  ADMIN: '/dashboard/admin',
  ADMIN_REPORTS: '/dashboard/admin/reports',
  ADMIN_MODERATION: '/dashboard/admin/moderation',
  ADMIN_APPEALS: '/dashboard/admin/appeals',

  BANNED: '/banned',

  THREAD: (slug: string) => `/thread/${slug}`,
  USER_PROFILE: (userId: string) => `/user/${userId}`,

  API: {
    AUTH: '/api/auth',
    THREADS: '/api/threads',
    UPLOAD: '/api/upload',
    NEWSLETTER_GENERATE: '/api/newsletter/generate',
  },
} as const;
