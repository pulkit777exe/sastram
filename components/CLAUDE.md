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
- Table, Switch, Loading video
- Theme toggle, Sonner toasts
- Animated icons

### `components/auth/`
Authentication components:
- LoginForm
- ForgotPasswordModal

### `components/dashboard/`
Dashboard-specific components:
- Sidebar, Header
- StatsCard, TopicCard, TopicGrid
- ThreadInsights, SearchDialog
- ProfileView, SettingsForm
- PreferencesForm, NewsletterManagement
- MessageGrid, CreateTopicButton

### `components/thread/`
Thread-specific components:
- CommentTree
- InviteFriendButton

### `components/admin/`
Admin dashboard components

## Pattern

Components use client-side rendering where needed. Zustand stores in `stores/` for state.

## Testing Notes

No unit tests currently for components. Visual/interaction testing would require Playwright or similar.