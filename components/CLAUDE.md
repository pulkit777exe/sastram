# Components Directory

## Overview

UI components organized by feature. Uses Tailwind CSS + shadcn/ui. SAI tokens: every card `border border-line rounded-card shadow-card`, `rounded-control` for inputs, `useUserPreferences` gates moat features.

## Subdirectories

### `components/ui/`
Reusable shadcn/ui components:
- Button, Input, Textarea, Select
- Dialog, Sheet, AlertDialog
- Avatar, Badge, Card
- Switch, Checkbox, Label
- Tooltip, ScrollArea, Separator
- Table, Skeleton
- Theme toggle, Sonner toasts
- Animated icons
- `detail-card.tsx` (`<DetailCard>` standard card wrapper), `overflow-menu.tsx` (kebab menu), `view-transition.tsx` (`<SaiViewTransition>` SSR-safe wrapper), `TimeAgo.tsx` (`use-now.ts` shared 30s ticker)

### `components/auth/`
Authentication components:
- LoginForm
- ForgotPasswordModal

### `components/dashboard/`
Dashboard-specific components:
- Sidebar, DashboardShell
- StatsCard, TopicCard, TopicGrid
- SettingsForm, SettingsTabs, PreferencesForm
- NewsletterManagement
- Account settings, AccountDangerZone

Note: `CreateTopicButton` was deleted — thread creation is `create-thread-dialog.tsx` → `createThreadAction`.

### `components/thread/`
Thread-specific components:
- CommentTree, MessageList
- ThreadLiveWrapper (+ `thread-context.tsx`; sync hook is `hooks/thread/use-thread-sync.ts`), ThreadDetailsPanel, ThreadPageHeader
- ThreadSummaryCard, ThreadTagsManager, TagChip
- InlinePoll, InlinePollButton, InlineReplyBox, InlineReplyThread
- PollDisplay, PollPanel (incl. market resolve)
- BookmarkButton, SubscribeButton, InviteFriendButton, BountyButton, ForkButton (+ `ForkRelationCard`)
- AttachmentItem, MessageActions, EditHistory (`edit-history.tsx`), EditThreadDialog
- AccessManagementModal, AppealMessageModal
- VerifyNowButton
- CodeRunner (Worker-sandboxed JS + Pyodide WASM Python)
- RenderContent, ExternalLinkPreview, ThreadListFilter

### `components/chat/`
Message composition components:
- PostMessageForm
- MentionSuggest

### `components/panels/`
Thread info panel components:
- ThreadResolutionCard (verified+decay+effectiveScore, pref-gated), RelatedThreadsCard, ParticipantsCard
- (ThreadSummaryCard lives in `components/thread/`)

### `components/admin/`
Admin dashboard components

### `components/appeals/`
Appeal form components

### `components/notifications/`
Notification list components

### `components/bookmarks/`
Bookmarks filter components

### `components/collections/`
Collection save/dropdown/list components (`CollectionItemsList`, `use-collections-dropdown.ts`)

### `components/feedback/`
Feedback widget components

### `components/graph/`
- ForceGraphCanvas (dynamic `import('force-graph')`, 360–560px, drag/zoom, `ThreadRelation` similarity ≥ 0.7)

### `components/user/`
User profile components:
- ProfileHeader, ProfileTabs
- UserStats
- FollowButton

### `components/landing/`
Landing page components

### `components/layout/`
Layout components

### `components/ai-search/`
AI search interface:
- `SearchPage.tsx`, `sai-search-layout.tsx`, `SearchBox`, `SearchInputBar`, `search-composer`
- `ChatMessageList`, `SynthesisCard`, `StreamingText`, `PhaseTracker`, `TaskSteps`, `LoadingState`
- `ModeDropdown`, `RecommendationCard`, `ApiKeysModal`
- `search-provider.tsx` + `use-search-conversation.ts` / `use-search-stream.ts`

### Top-level
- `providers.tsx` - Client providers
- `bootstrap-provider.tsx` - Bootstrap data provider
- `create-thread-dialog.tsx` - Thread creation dialog (canonical creation path)
- `logo.tsx` - Logo component

## Pattern

Components use client-side rendering where needed. React hooks + `hooks/` (long lists virtualized with `@tanstack/react-virtual`; no Zustand store — `stores/` does not exist). Poll lightweight GET endpoints for AI cards — never `router.refresh()` for summary/resolution polling.

## Testing Notes

Component coverage exists in `test/` (Mocha + Testing Library): `components`, `thread-components`, `thread-details-panel`, `chat-message-list`, `overflow-menu`, `search-input-bar`, `thread-sync`, `use-now`, `view-transition`. E2E coverage in `test/e2e/` (Playwright: `smoke`, `collections`, `thread-edit`) — run in CI's `e2e` job.
