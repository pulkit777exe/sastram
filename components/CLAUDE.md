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
Dashboard-specific components:
- Sidebar, DashboardShell
- StatsCard, TopicCard, TopicGrid
- MessageGrid, CreateTopicButton
- SettingsForm, SettingsTabs, PreferencesForm
- NewsletterManagement
- Account settings, AccountDangerZone

### `components/thread/`
Thread-specific components:
- CommentTree, MessageList
- ThreadLiveWrapper, ThreadDetailsPanel, ThreadPageHeader
- ThreadSummaryCard
- InlinePoll, InlinePollButton, InlineReplyBox, InlineReplyThread
- PollDisplay, PollPanel
- BookmarkButton, SubscribeButton, InviteFriendButton
- TagChip, AttachmentItem, MessageActions
- AccessManagementModal, AppealMessageModal
- VerifyNowButton
- TimeAgo

### `components/chat/`
Message composition components:
- PostMessageForm
- MentionSuggest

### `components/panels/`
Thread info panel components:
- ThreadInfoCard, ThreadDnaCard, ThreadResolutionCard
- AiSynthesisCard, RelatedThreadsCard, ParticipantsCard

### `components/admin/`
Admin dashboard components

### `components/appeals/`
Appeal form components

### `components/notifications/`
Notification list components

### `components/user/`
User profile components:
- ProfileHeader, ProfileTabs
- UserStats, UserThreadsList
- FollowButton

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
- `create-thread-dialog.tsx` - Thread creation dialog
- `logo.tsx` - Logo component

## Pattern

Components use client-side rendering where needed. Zustand for state management.

## Testing Notes

No unit tests currently for components. Visual/interaction testing would require Playwright or similar.
