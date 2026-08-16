# Components Directory

## Overview

UI components organized by feature. Uses Tailwind CSS + shadcn/ui.

## Subdirectories

### `components/ui/`
Reusable shadcn/ui components:
- Button, Input, Textarea, Select
- Dialog, Sheet, AlertDialog
- Avatar, Badge, Card
- Switch, Checkbox, Label
- Tooltip, ScrollArea, Separator
- Table, Loading video
- Theme toggle, Sonner toasts
- Animated icons

### `components/auth/`
Authentication components:
- LoginForm
- ForgotPasswordModal

### `components/dashboard/`
Dashboard shell and composition only:
- DashboardShell, DashboardProviders, Sidebar
- TopicCard, TopicGrid

### `components/thread/`
Thread-specific components (detail view, message composition, panels):
- CommentTree, MessageList
- PostMessageForm, MentionSuggest, InlineReplyBox, InlineReplyThread
- ThreadLiveWrapper, ThreadDetailsPanel, ThreadPageHeader, ThreadSummaryCard
- thread-resolution-card, related-threads-card, participants-card
- InlinePoll, InlinePollButton, PollDisplay, PollPanel
- SubscribeButton, InviteFriendButton, AttachmentItem, MessageActions
- VerifyNowButton, CreateThreadDialog, TimeAgo

### `components/account/`
Account management components:
- AccountTab, AccountDangerZone
- ActiveSessionsCard, ConnectedAccountsCard, EmailChangeCard
- PasswordResetCard, AccountApiKeysCard

### `components/settings/`
Settings components:
- SettingsForm, SettingsTabs, PreferencesForm

### `components/newsletter/`
Newsletter subscription components:
- NewsletterManagement

### `components/admin/`
Admin dashboard components

### `components/appeals/`
Appeal form components

### `components/notifications/`
Notification list components

### `components/user/`
User profile components:
- ProfileHeader, UserStats, FollowButton

### `components/landing/`
Landing page components

### `components/layout/`
Layout components

### `components/ai-search/`
AI search interface:
- SearchBox, Sidebar, PhaseTracker
- SynthesisCard, SourceCard, TableView
- ApiKeysModal

### Top-level
- `providers.tsx` - Client providers
- `bootstrap-provider.tsx` - Bootstrap data provider
- `logo.tsx` - Logo component

## Pattern

Components use client-side rendering where needed.

## Testing Notes

No unit tests currently for components. Visual/interaction testing would require Playwright or similar.
