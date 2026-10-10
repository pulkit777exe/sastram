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

  // Real App Router location. `/thread/:slug` still exists as a permanent
  // redirect in next.config.ts for legacy/external links, but internal links
  // and revalidatePath calls must target the actual route to avoid a redirect
  // hop per navigation and no-op cache invalidation.
  THREAD: (slug: string) => `/dashboard/threads/${slug}`,
  USER_PROFILE: (userId: string) => `/user/${userId}`,

  API: {
    AUTH: '/api/auth',
    THREADS: '/api/threads',
    UPLOAD: '/api/upload',
  },
} as const;
