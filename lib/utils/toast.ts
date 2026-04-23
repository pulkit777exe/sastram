'use client';

import { toast } from 'sonner';

export const toasts = {
  // Success
  saved: () => toast.success('Saved successfully'),
  sent: () => toast.success('Message sent'),
  copied: () => toast.success('Copied to clipboard'),

  // Errors — specific and actionable
  notIterable: () =>
    toast.error('Failed to load content. Please refresh the page.', {
      action: { label: 'Refresh', onClick: () => window.location.reload() },
    }),
  sessionExpired: () =>
    toast.error('Your session has expired.', {
      description: 'Please sign in again to continue.',
    }),
  networkError: () =>
    toast.error('Connection issue.', {
      description: 'Check your internet connection and try again.',
    }),
  serverError: () =>
    toast.error('Something went wrong on our end.', {
      description: 'This has been logged. Please try again in a moment.',
    }),

  // AI-specific errors
  aiUnavailable: () =>
    toast.error('AI search is temporarily unavailable.', {
      description: 'Try again in a moment. Your query has been saved.',
    }),
  exaRateLimited: () =>
    toast.error('Search limit reached.', {
      description: 'Exa search is rate limited. Results may be partial.',
    }),
  tavilyError: () =>
    toast.error('Web search unavailable.', {
      description: 'Tavily search failed. Using Exa results only.',
    }),
  geminiDown: () =>
    toast.error('AI synthesis unavailable.', {
      description: 'Gemini is unreachable. Raw search results shown instead.',
    }),
  aiInlineRateLimit: () =>
    toast.error('AI mention limit reached.', {
      description: 'You can use @ai 3 times per thread per day.',
    }),
  aiTimeout: () =>
    toast.error('AI request timed out.', {
      description: 'The provider did not respond in time. Please try again.',
    }),
  partialResults: () => toast.info('Showing partial results - web search unavailable'),

  // Auth errors
  invalidOtp: () =>
    toast.error('Incorrect code.', {
      description: 'Check your email and enter the 6-digit code. It expires in 10 minutes.',
    }),
  otpExpired: () =>
    toast.error('Code expired.', {
      description: 'Request a new code and try again.',
    }),

  // Feature errors
  attachmentTooLarge: (maxMb: number) =>
    toast.error('File too large.', {
      description: `Maximum file size is ${maxMb}MB.`,
    }),
  mentionNotFound: (username: string) =>
    toast.error(`@${username} not found.`, {
      description: 'Check the username and try again.',
    }),

  // Generic with custom message
  error: (message: string, description?: string) => toast.error(message, { description }),
  success: (message: string, description?: string) => toast.success(message, { description }),
  info: (message: string, description?: string) => toast.info(message, { description }),
};
