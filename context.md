# Sastram - Project Context

This document provides a high-level overview of the application's structure, features, and key functions without exposing the raw code.

## 1. Domain Modules (`modules/`)

### Feature: Activity

- **actions.ts**: Server Actions (Extends UI to backend operations).
  - `recordActivityAction`
  - `getUserActivityAction`
  - `getFollowedUsersActivityAction`
- **index.ts**: Module Exports.
- **repository.ts**: Database Operations (Handles query execution).
  - `recordActivity`
  - `getUserActivity`
  - `getFollowedUsersActivity`
- **types.ts**: Type Definitions.
  - `UserActivity`

### Feature: Admin

- **actions.ts**: Server Actions (Extends UI to backend operations).
  - `getAdminDashboardData`
- **index.ts**: Module Exports.
- **repository.ts**: Database Operations (Handles query execution).
  - `getAdminStats`
- **types.ts**: Type Definitions.
  - `AdminStats`
  - `AdminDashboardData`

### Feature: Appeals

- **actions.ts**: Server Actions (Extends UI to backend operations).
  - `submitAppeal`
  - `getAppeals`
  - `resolveAppeal`

### Feature: Audit

- **repository.ts**: Database Operations (Handles query execution).
  - `AuditLogDetails`
  - `logAction`
  - `getAuditLogs`
  - `getEntityHistory`
  - `getUserActivity`
  - `getAuditLogStats`
  - `getMostActiveUsers`
  - `searchAuditLogs`
  - `cleanupOldAuditLogs`

### Feature: Auth

- **index.ts**: Module Exports.
- **session.ts**
  - `SessionUser`
  - `SessionPayload`
  - `getSession`
  - `requireSession`
  - `isAdmin`
  - `assertAdmin`

### Feature: Badges

- **actions.ts**: Server Actions (Extends UI to backend operations).
  - `getUserBadgesAction`
  - `checkAndAwardBadgesAction`
  - `getAllBadgesAction`
- **index.ts**: Module Exports.
- **repository.ts**: Database Operations (Handles query execution).
  - `getUserBadges`
  - `awardBadge`
  - `checkAndAwardBadges`
  - `getAllBadges`
  - `createBadge`
- **types.ts**: Type Definitions.
  - `UserBadge`
  - `UserBadgeEarned`

### Feature: Bookmarks

- **actions.ts**: Server Actions (Extends UI to backend operations).
  - `toggleBookmark`
  - `getBookmarkedThreads`
  - `checkBookmarkStatus`
- **index.ts**: Module Exports.
- **repository.ts**: Database Operations (Handles query execution).
  - `bookmarkThread`
  - `unbookmarkThread`
  - `getUserBookmarks`
  - `isBookmarked`
- **types.ts**: Type Definitions.
  - `Bookmark`
  - `BookmarkedThreadsResponse`

### Feature: Chat

- **actions.ts**: Server Actions (Extends UI to backend operations).
  - `getConversations`
  - `createConversation`
  - `getMessages`
  - `sendMessage`
- **index.ts**: Module Exports.

### Feature: Communities

- **actions.ts**: Server Actions (Extends UI to backend operations).
  - `createCommunityAction`
- **index.ts**: Module Exports.
- **repository.ts**: Database Operations (Handles query execution).
  - `buildCommunityDTO`
  - `listCommunities`
  - `createCommunity`
- **types.ts**: Type Definitions.
  - `CommunitySummary`

### Feature: Follows

- **actions.ts**: Server Actions (Extends UI to backend operations).
  - `followUser`
  - `unfollowUser`
  - `getFollowers`
  - `getFollowing`
  - `checkFollowingStatus`
- **index.ts**: Module Exports.
- **repository.ts**: Database Operations (Handles query execution).
  - `followUser`
  - `unfollowUser`
  - `getFollowers`
  - `getFollowing`
  - `isFollowing`
  - `getMutualFollows`
- **schemas.ts**
  - `followUserSchema`
  - `getFollowersSchema`
  - `getFollowingSchema`
- **types.ts**: Type Definitions.
  - `UserFollow`
  - `FollowersResponse`
  - `FollowingResponse`

### Feature: Invitations

- **actions.ts**: Server Actions (Extends UI to backend operations).
  - `inviteFriendToThread`
- **index.ts**: Module Exports.
- **schemas.ts**
  - `inviteFriendSchema`
- **types.ts**: Type Definitions.
  - `ThreadInvitation`

### Feature: Members

- **actions.ts**: Server Actions (Extends UI to backend operations).
  - `joinSection`
  - `leaveSection`
  - `inviteMember`
  - `updateMemberRoleAction`
  - `removeMemberAction`
  - `getSectionMembersAction`
- **index.ts**: Module Exports.
- **repository.ts**: Database Operations (Handles query execution).
  - `addMember`
  - `removeMember`
  - `updateMemberRole`
  - `getSectionMembers`
  - `getUserMemberships`
  - `getMemberRole`
  - `isMember`
- **schemas.ts**
  - `joinSectionSchema`
  - `leaveSectionSchema`
  - `inviteMemberSchema`
  - `updateMemberRoleSchema`
  - `removeMemberSchema`
  - `getSectionMembersSchema`
- **types.ts**: Type Definitions.
  - `SectionMember`

### Feature: Messages

- **actions.ts**: Server Actions (Extends UI to backend operations).
  - `postMessage`
  - `editMessage`
  - `pinMessage`
  - `getMessageEditHistory`
- **index.ts**: Module Exports.
- **schemas.ts**
  - `createMessageSchema`
  - `editMessageSchema`
  - `pinMessageSchema`
  - `getMessageEditHistorySchema`
- **types.ts**: Type Definitions.
  - `MessageWithDetails`
  - `MessageEditHistory`
  - `PostMessageResult`

### Feature: Moderation

- **actions.ts**: Server Actions (Extends UI to backend operations).
  - `deleteMessageAction`
  - `bulkDeleteMessages`
  - `banUser`
  - `unbanUser`
  - `getBannedUsers`
  - `deleteCommunity`
  - `deleteThread`
  - `getMessageDetails`
  - `getModerationQueue`
- **index.ts**: Module Exports.
- **schemas.ts**
  - `banUserSchema`
  - `deleteMessageSchema`
  - `deleteEntitySchema`
  - `getBannedUsersSchema`
  - `getMessageDetailsSchema`
  - `getModerationQueueSchema`
- **types.ts**: Type Definitions.
  - `BannedUser`
  - `MessageDetails`

### Feature: Newsletter

- **actions.ts**: Server Actions (Extends UI to backend operations).
  - `unsubscribeFromThread`
  - `getUserNewsletterSubscriptions`
  - `subscribeToThreadAction`
- **index.ts**: Module Exports.
- **repository.ts**: Database Operations (Handles query execution).
  - `subscribeToThreadNewsletter`
  - `getThreadTranscript`
  - `scheduleThreadDigest`
  - `getDueDigests`
  - `listThreadSubscribers`
  - `isUserSubscribedToThread`
  - `markDigestProcessing`
  - `completeDigest`
- **service.ts**: Business Logic (Domain logic & integrations).
  - `subscribeToThread`
  - `processPendingDigests`

### Feature: Notifications

- **actions.ts**: Server Actions (Extends UI to backend operations).
  - `getNotifications`
  - `markNotificationRead`
  - `markAllNotificationsRead`
  - `getUnreadNotificationCount`
- **index.ts**: Module Exports.
- **repository.ts**: Database Operations (Handles query execution).
  - `NotificationData`
  - `createNotification`
  - `createBulkNotifications`
  - `getUserNotifications`
  - `getNotificationById`
  - `markAsRead`
  - `markAsUnread`
  - `markAllAsRead`
  - `markMultipleAsRead`
  - `getUnreadCount`
  - `getUnreadCountByType`
  - `deleteNotification`
  - `deleteAllNotifications`
  - `deleteReadNotifications`
  - `getNotificationStats`
  - `getRecentNotifications`
  - `notifyMultipleUsers`
  - `cleanupOldNotifications`
- **schemas.ts**
  - `getNotificationsSchema`
  - `markNotificationReadSchema`
- **types.ts**: Type Definitions.
  - `Notification`

### Feature: Polls

- **actions.ts**: Server Actions (Extends UI to backend operations).
  - `createPollAction`
  - `voteOnPollAction`
  - `getPollResultsAction`
  - `getUserVoteAction`
  - `getPollByThreadAction`
- **index.ts**: Module Exports.
- **repository.ts**: Database Operations (Handles query execution).
  - `createPoll`
  - `voteOnPoll`
  - `getPollResults`
  - `getUserVote`
  - `getPollByThreadId`
- **schemas.ts**
  - `createPollSchema`
  - `voteOnPollSchema`
- **types.ts**: Type Definitions.
  - `Poll`
  - `PollVote`
  - `PollResults`

### Feature: Reactions

- **actions.ts**: Server Actions (Extends UI to backend operations).
  - `toggleReaction`
  - `getReactionSummary`
- **index.ts**: Module Exports.
- **repository.ts**: Database Operations (Handles query execution).
  - `addReaction`
  - `removeReaction`
  - `getMessageReactions`
  - `getUserReaction`
- **schemas.ts**
  - `toggleReactionSchema`
  - `getReactionSummarySchema`
- **types.ts**: Type Definitions.
  - `ReactionSummary`

### Feature: Reports

- **actions.ts**: Server Actions (Extends UI to backend operations).
  - `createReport`
  - `getReports`
  - `getReportStats`
  - `getReportWithContext`
  - `updateReportStatusAction`
  - `getMyReports`
  - `resolveReport`
- **index.ts**: Module Exports.
- **schemas.ts**
  - `createReportSchema`
  - `updateReportStatusSchema`
  - `getReportDetailsSchema`
  - `resolveReportSchema`
  - `CreateReportInput`
  - `UpdateReportStatusInput`
  - `ResolveReportInput`
- **types.ts**: Type Definitions.
  - `Report`
  - `ReportWithContext`
  - `ReportQueueItem`
  - `ReportStats`

### Feature: Reputation

- **actions.ts**: Server Actions (Extends UI to backend operations).
  - `getUserReputationAction`
  - `awardReputationAction`
  - `syncReputationPointsAction`
  - `awardReputationForAction`
- **index.ts**: Module Exports.
- **repository.ts**: Database Operations (Handles query execution).
  - `getUserReputation`
  - `awardReputation`
  - `calculateReputationPoints`
  - `syncReputationPoints`
- **types.ts**: Type Definitions.
  - `UserReputation`

### Feature: Search

- **actions.ts**: Server Actions (Extends UI to backend operations).
  - `searchThreadsAction`
  - `searchMessagesAction`
  - `searchUsersAction`
- **index.ts**: Module Exports.
- **repository.ts**: Database Operations (Handles query execution).
  - `searchThreads`
  - `searchMessages`
  - `searchUsers`
- **types.ts**: Type Definitions.
  - `SearchResults`

### Feature: Tags

- **actions.ts**: Server Actions (Extends UI to backend operations).
  - `createTagAction`
  - `addTagToThreadAction`
  - `removeTagFromThreadAction`
  - `getThreadTagsAction`
  - `getPopularTagsAction`
- **index.ts**: Module Exports.
- **repository.ts**: Database Operations (Handles query execution).
  - `createTag`
  - `addTagToThread`
  - `removeTagFromThread`
  - `getThreadTags`
  - `getPopularTags`
- **types.ts**: Type Definitions.
  - `ThreadTag`
  - `TagWithCount`

### Feature: Threads

- **actions.ts**: Server Actions (Extends UI to backend operations).
  - `createThreadAction`
  - `deleteThreadAction`
  - `getDashboardThreads`
  - `getThreadMembersAction`
  - `manageThreadMemberAction`
- **api-client.ts**
  - `fetchThreads`
- **index.ts**: Module Exports.
- **repository.ts**: Database Operations (Handles query execution).
  - `ListThreadsParams`
  - `PaginatedThreads`
  - `listThreads`
  - `getThreadBySlug`
  - `createThread`
  - `deleteThread`
  - `getThreadMembers`
  - `addThreadMember`
  - `updateThreadMemberRole`
  - `removeThreadMember`
- **service.ts**: Business Logic (Domain logic & integrations).
  - `slugifyTitle`
  - `buildThreadSlug`
  - `buildThreadDTO`
  - `buildThreadDetailDTO`
  - `buildCommunityDTO`
- **types.ts**: Type Definitions.
  - `ThreadRecord`
  - `ThreadSummary`
  - `ThreadDetail`
  - `MessageWithDetails`
  - `ReactionSummary`
  - `AttachmentInfo`
  - `CommunitySummary`
  - `CommunityDetail`
  - `UserProfile`
  - `ThreadMember`
  - `NotificationInfo`
  - `PaginatedResponse`
  - `ThreadFilters`
  - `MessageFilters`
  - `CreateThreadInput`
  - `UpdateThreadInput`
  - `CreateMessageInput`
  - `UpdateMessageInput`
  - `BanInfo`
  - `ReportInfo`
  - `ThreadStats`
  - `UserStats`

### Feature: Topics

- **actions.ts**: Server Actions (Extends UI to backend operations).
  - `createTopic`
- **index.ts**: Module Exports.
- **schemas.ts**
  - `createTopicSchema`
- **types.ts**: Type Definitions.
  - `Topic`

### Feature: Users

- **actions.ts**: Server Actions (Extends UI to backend operations).
  - `updateUserProfile`
  - `uploadAvatar`
  - `uploadBanner`
  - `getUserProfile`
  - `getUserThreadsAction`
  - `updateProfilePrivacyAction`
- **index.ts**: Module Exports.
- **repository.ts**: Database Operations (Handles query execution).
  - `getPublicProfile`
  - `getUserThreads`
  - `updateProfilePrivacy`
  - `getUserMessages`
- **schemas.ts**
  - `updateUserProfileSchema`
  - `uploadAvatarSchema`
  - `uploadBannerSchema`
  - `updateProfilePrivacySchema`
- **types.ts**: Type Definitions.
  - `UserProfile`

### Feature: Ws

- **publisher.ts**
  - `emitThreadMessage`
  - `emitTypingIndicator`
  - `emitMessageDeleted`
  - `emitMentionNotification`

## 2. API Routes (`app/api/`)

### Endpoint: `/api/ai/thread-summary`

- **Handlers executed by Next.js**:
  - `POST`

### Endpoint: `/api/auth/[...all]`

- **Handlers executed by Next.js**:

### Endpoint: `/api/conversations`

- **Handlers executed by Next.js**:
  - `GET`
  - `POST`

### Endpoint: `/api/cron/daily-digest`

- **Handlers executed by Next.js**:
  - `GET`

### Endpoint: `/api/email-otp/check-verification-otp`

- **Handlers executed by Next.js**:
  - `POST`

### Endpoint: `/api/email-otp/reset-otp`

- **Handlers executed by Next.js**:
  - `POST`

### Endpoint: `/api/email-otp/send-verification-otp`

- **Handlers executed by Next.js**:
  - `POST`

### Endpoint: `/api/forget-password/email-otp`

- **Handlers executed by Next.js**:
  - `POST`

### Endpoint: `/api/newsletter/generate`

- **Handlers executed by Next.js**:
  - `POST`

### Endpoint: `/api/sign-in/email-otp`

- **Handlers executed by Next.js**:
  - `POST`

### Endpoint: `/api/threads`

- **Handlers executed by Next.js**:
  - `GET`

### Endpoint: `/api/upload`

- **Handlers executed by Next.js**:
  - `POST`
  - `POST`

### Endpoint: `/api/v1/moderation/appeals/review/[id]`

- **Handlers executed by Next.js**:
  - `POST`

### Endpoint: `/api/v1/moderation/appeals/submit`

- **Handlers executed by Next.js**:
  - `POST`

### Endpoint: `/api/v1/moderation/queue`

- **Handlers executed by Next.js**:
  - `GET`

### Endpoint: `/api/v1/moderation/rules`

- **Handlers executed by Next.js**:
  - `GET`
  - `POST`
  - `PUT`
  - `DELETE`

### Endpoint: `/api/v1/moderation/stats`

- **Handlers executed by Next.js**:
  - `GET`

## 3. UI Components (`components/`)

- **admin/NewsletterDigestAdmin.tsx**
  - `NewsletterDigestAdmin`
- **admin/action-modal.tsx**
  - `ModerationActionType`
  - `ActionModal`
- **admin/admin-moderation-panel.tsx**
  - `AdminModerationPanel`
- **admin/appeals-list.tsx**
  - `AppealsList`
- **admin/audit-log-table.tsx**
  - `AuditLogTable`
- **admin/banned-users-list.tsx**
  - `BannedUser`
  - `BannedUsersList`
- **admin/moderation-dashboard.tsx**
  - `ModerationDashboard`
- **admin/moderation-queue.tsx**
  - `ModerationQueue`
- **admin/report-actions.tsx**
  - `ReportActions`
- **admin/report-review-panel.tsx**
  - `ReportReviewPanel`
- **appeals/appeal-form.tsx**
  - `AppealForm`
- **auth/LoginForm.tsx**
  - `LoginForm`
- **dashboard/create-topic-button.tsx**
  - `CreateTopicButton`
- **dashboard/header.tsx**
  - `DashboardHeader`
- **dashboard/message-grid.tsx**
  - `MessageGrid`
- **dashboard/newsletter-management.tsx**
  - `NewsletterManagement`
- **dashboard/profile-view.tsx**
  - `ProfileView`
- **dashboard/search-dialog.tsx**
  - `SearchDialog`
- **dashboard/settings-form.tsx**
  - `SettingsForm`
- **dashboard/settings-tabs.tsx**
  - `SettingsTabs`
- **dashboard/sidebar.tsx**
  - `Sidebar`
- **dashboard/stats-card.tsx**
  - `StatsCard`
- **dashboard/thread-insights.tsx**
  - `ThreadInsights`
- **dashboard/topic-card.tsx**
  - `TopicCard`
- **dashboard/topic-grid.tsx**
  - `TopicGrid`
- **providers.tsx**
  - `Providers`
- **thread/SubscriptionSuccessModal.tsx**
  - `SubscriptionSuccessModal`
- **thread/access-management-modal.tsx**
  - `ThreadAccessModal`
- **thread/appeal-message-modal.tsx**
  - `AppealMessageModal`
- **thread/bookmark-button.tsx**
  - `BookmarkButton`
- **thread/comment-tree.tsx**
  - `CommentTree`
- **thread/invite-friend-button.tsx**
  - `InviteFriendButton`
- **thread/poll-display.tsx**
  - `PollDisplay`
- **thread/report-button.tsx**
  - `ReportButton`
- **thread/subscribe-button.tsx**
  - `ThreadSubscribeButton`
- **thread/tag-chip.tsx**
  - `TagChip`
- **thread/thread-management-controls.tsx**
  - `ThreadManagementControls`
- **thread/thread-summary-card.tsx**
  - `ThreadSummaryCard`
- **ui/animated-icon.tsx**
  - `AnimatedIcon`
- **ui/loading-video.tsx**
  - `LoadingVideo`
- **ui/theme-toggle.tsx**
  - `ThemeToggle`
- **user/follow-button.tsx**
  - `FollowButton`
- **user/profile-header.tsx**
  - `ProfileHeader`
- **user/profile-tabs.tsx**
  - `ProfileTabs`
- **user/user-stats.tsx**
  - `UserStats`
- **user/user-threads-list.tsx**
  - `UserThreadsList`
