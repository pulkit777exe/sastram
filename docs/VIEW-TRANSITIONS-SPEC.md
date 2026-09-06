# View Transitions on Thread + SaiSearch — Spec

Status: draft, awaiting go-ahead before implementation.

Scope: thread page (`/dashboard/threads/[slug]`) and SaiSearch (`/dashboard/sai-search`).
Source skills (summary-only, per your instruction):
- `vercel-react-view-transitions` (anchor)
- `vercel-composition-patterns` (SaiSearch already follows these conventions)
- `vercel-react-best-practices` (perf guardrails for new transitions)
- `next-best-practices` (RSC boundary discipline)
- `impeccable` (animation/motion hygiene: duration, easing, `prefers-reduced-motion`)
- `find-animation-opportunities` (gate: every `<ViewTransition>` must articulate a spatial relationship)
- `webapp-testing` (smoke coverage for the chat surfaces)
- `prisma-client-api` (no DB work planned, kept in mind for indexing if reorder animation triggers more queries)

Honesty note: I do not have the full text of these skills in front of me. The implementation below reflects my prior knowledge of their public content; call out anything that looks off and I will re-fetch.

## Inventory of surfaces (read)

### Thread page (`components/thread/`)
- `thread-live-wrapper.tsx:341-549` — root layout; pinned banner, message stream, scroll-to-bottom button, composer.
- `thread-details-panel.tsx:74-121` — drawer panel (trigger, overlay, slide-in-from-right `animate-in`).
- `thread-page-header.tsx` — no transitions today; green pulse already animates.
- Composer lives in `components/chat/post-message-form.tsx`.

### SaiSearch (`components/ai-search/`)
- `SearchPage.tsx:37-65` — already uses `framer-motion` for the idle→active flip (one-off). No shared-element morph.
- `SearchInputBar.tsx` — sticks to bottom of active chat.
- `ChatMessageList.tsx:107-153` — message bubbles + streaming reveal.
- `search-provider.tsx`, `use-search-conversation.ts`, `use-search-stream.ts` — state lift; state-decoupled from UI per composition patterns.

### Stack
- React `^19.2.8`, Next `^16.3.1`, `framer-motion ^12.43.0` already installed.
- `react@canary` is NOT needed (React 19 stable ships `<ViewTransition>` natively).
- Zod-validated env in `lib/config/env.ts`; feature flags go through `serverEnvSchema` / `fullyClientSafeSchema` and use `NEXT_PUBLIC_` for client access.
- `experimental.optimizePackageImports` in `next.config.ts` already excludes `framer-motion` tree-shake concerns.

## Feature flag

Single flag, server + client read:

- `NEXT_PUBLIC_VIEW_TRANSITIONS_ENABLED` (`'true' | 'false'`, default `'true'` per your "default-on" choice).
- Registered in `fullyClientSafeSchema` (client) and `serverEnvSchema` (server) of `lib/config/env.ts`.
- Helper: `lib/utils/view-transitions.ts` exporting:
  - `isViewTransitionsEnabled()` — SSR-safe boolean from `clientEnv.NEXT_PUBLIC_VIEW_TRANSITIONS_ENABLED` (client-safe default `'true'`).
  - `supportsViewTransitions()` — runtime browser check (`typeof document !== 'undefined' && 'startViewTransition' in document`); used at the call site, never on the server.

SSR safety: gate all `<ViewTransition>` rendering on a `useEffect`-set `enabled` boolean so server output and first client render match (no hydration mismatch). On unsupported browsers the component renders plain children with no view-transition name.

## Patterns shipped

### SaiSearch
- **#6 shared element — idle composer → active input bar** (`name="ai-search-composer-idle"` on the idle `SearchField`, `name="ai-search-composer-active"` on the active `InputBar`). Implemented. The first user bubble does NOT share a name (initial design did; that created a name-collision across three elements where Chromium's "last in wins" gave undefined morph targets — fixed by giving each pair a distinct name).
- **#7 Suspense reveal — first synthesis card** (`name="ai-search-first-synthesis"` on the streaming `SynthesisCard` root, with `update="none"` to prevent the transition from re-firing on every SSE chunk). Implemented.
- Removed the `framer-motion` single-fade wrapper in `SearchPage.tsx`; the View Transition wrapper handles idle→active now.

### Thread page
- **#1 shared element — empty-state card** (`name="thread-empty-state"` on the visible styled card root, not the outer `py-10` wrapper). Shipped as a single-element exit fade (no bubble morph; deferred because the first message lives inside `CommentTree`). The 220ms fade-out is a deliberate "the empty state yields" beat before the message bubble's normal mount.
- **#3 state change — detail drawer** — was wired with `document.startViewTransition` + `view-transition-name` on the dialog, but the trigger button had no name and the geometry was too different for a clean shared-element morph. Dropped the morph entirely; the existing `animate-in slide-in-from-right duration-200` + `fade-in duration-150` on the backdrop already do the right thing visually.

## Patterns explicitly dropped

| Pattern | Reason |
|---|---|
| Thread #2 pinned banner | Already animates tastefully; View Transition adds a single-frame fade for no spatial story. |
| Thread #4 scroll-to-bottom FAB | Too short to register; would be motion noise. |
| Thread #5 optimistic → confirmed | Reconciliation is correct as-is; visual swap adds fragility for a benefit most users won't notice. |
| SaiSearch #8 list reorder | Needs `useDeferredValue` rewriting of `messages` array; cost > benefit at current counts. |
| SaiSearch #9 error/blocked | `appState === 'error'` should be instant. Animating errors is hostile. |
| SaiSearch #10 route change | `next/view-transitions` not in Next 16.3.1 stable. Revisit later. |
| Thread #1 bubble-morph half | First message lives inside `CommentTree`; wrapping it adds gating logic for a benefit users feel as "instant" today. |
| Thread #3 drawer morph | The browser's view-transition-name system needs a same-name source AND target. Trigger is 40×40 in the corner; dialog is 320px full-height. Geometry rules out a clean shared-element morph. `animate-in` was already doing the right thing. |

## Eng review fix log

After the initial implementation, an architecture review found the shipped code looked right but didn't actually fire. The blockers were:

1. **React canary `<ViewTransition>` only fires on async updates** (`startTransition`, `useDeferredValue`, Actions, `<Suspense>`). All state mutations in `use-search-conversation.ts` were synchronous bare setters. **Fixed by wrapping the idle→active flip, the first user bubble mount, and the first synthesis card reveal in `startTransition`.**
2. **Drawer morph had no shared source element.** The trigger button had no `view-transition-name`; the browser couldn't pair old → new. **Fixed by dropping the drawer morph and the manual `startViewTransition` calls entirely.**
3. **Three elements shared one name (`ai-search-composer`) across different lifecycles.** Chromium's "last in wins" gave undefined morph targets. **Fixed by giving each pair a distinct name (`-idle` and `-active`); the first user bubble loses the shared-name treatment and fades in plainly.**
4. **Wrapper applied `view-transition-name` to the inner element, not the visible root.** The browser captured a smaller bounding box than the user expected. **Fixed by inverting the wrapper nesting in `SearchField` and moving the empty-state wrapper to the visible styled card.**
5. **Streaming `SynthesisCard` would re-fire transition on every chunk** (canary `<ViewTransition>` fires on `onUpdate` for content changes). **Fixed by adding `update="none"` to the streaming wrapper.**
6. **`::view-transition-new(thread-empty-state)` was dead CSS** (no NEW element with that name; the empty state is exit-only). **Fixed by removing the dead rule from `globals.css`.**
7. **Unused `useViewTransitionsEnabled` export and unused `startViewTransition` helper** — latent footguns, no current consumers. **Fixed by removing both.**
8. **`::view-transition-old/new(ai-search-composer)` rule** pointed at a name that no longer exists after the rename. **Fixed by rewriting CSS to target `-idle` and `-active` separately with a shared `vt-morph` keyframe.**

## Canary note

The original spec assumed React 19 stable ships `<ViewTransition>`. It does not — you need `react@canary`. After surfacing this and getting the call, we bumped to `react@19.3.0-canary-2dc7da79-20260828`. The canary types expose `React.ViewTransition` as an `ExoticComponent`. The `SaiViewTransition` wrapper gates the canary component on the flag + browser support via `useSyncExternalStore`, so the server render and first client render match (no hydration mismatch). Critical detail: `<ViewTransition>` only fires for async updates (startTransition, useDeferredValue, Actions, Suspense); all consumer state mutations must be wrapped in `startTransition` or the transition never triggers.

## Files changed (final)

```
add  lib/utils/view-transitions.ts
add  components/ui/view-transition.tsx
mod  lib/config/env.ts                  # NEXT_PUBLIC_VIEW_TRANSITIONS_ENABLED (default true)
mod  .env.sample
mod  app/globals.css                    # ::view-transition-* rules + reduced-motion guard
mod  components/ai-search/SearchPage.tsx          # removed framer-motion wrapper
mod  components/ai-search/search-composer.tsx     # wrapped SearchField + InputBar with distinct names
mod  components/ai-search/ChatMessageList.tsx     # streaming SynthesisCard with update="none"
mod  components/ai-search/use-search-conversation.ts  # startTransition wrapping on idle→active, first user bubble, first synthesis card
mod  components/thread/thread-live-wrapper.tsx    # empty-state card wrapped at visible root
mod  components/thread/thread-details-panel.tsx   # dropped dead view-transition-name + manual startViewTransition
add  test/view-transition.test.tsx
mod  package.json                       # react + react-dom → canary
```

## Graceful degradation contract

- **No browser support:** `supportsViewTransitions()` is `false` → components render their plain JSX children. No `viewTransition` props attached, no `::view-transition-*` CSS, no behavior change. The framer-motion fade at `SearchPage.tsx:51-55` stays as the fallback.
- **Flag off:** identical to no-support path. One branch.
- **`prefers-reduced-motion: reduce`:** add a CSS guard at `app/globals.css`:
  ```css
  @media (prefers-reduced-motion: reduce) {
    ::view-transition-old(*),
    ::view-transition-new(*) { animation-duration: 0.01ms !important; }
  }
  ```
- **Hydration safety:** every gated render path uses `useEffect` to flip a local `enabled` boolean after mount. No SSR/client diff.
- **Forced colors / high-contrast:** the `::view-transition-group` pseudo-elements inherit text color; no background-color set so `forced-colors` media-query users see the system palette.

## Files to add / change

```
add  lib/utils/view-transitions.ts          # isViewTransitionsEnabled + supportsViewTransitions
add  components/ui/view-transition.tsx     # <SaiViewTransition> wrapper, SSR-safe + reduced-motion aware
mod  lib/config/env.ts                      # register NEXT_PUBLIC_VIEW_TRANSITIONS_ENABLED
mod  .env.sample                            # document the flag
mod  app/globals.css                        # prefers-reduced-motion + ::view-transition-group styling
mod  components/thread/thread-live-wrapper.tsx
mod  components/thread/thread-details-panel.tsx
mod  components/chat/post-message-form.tsx
mod  components/ai-search/SearchPage.tsx
mod  components/ai-search/SearchInputBar.tsx
mod  components/ai-search/ChatMessageList.tsx
add  test/components/view-transition.test.tsx  # mocha unit: enabled+supported / disabled / unsupported
add  test/e2e/thread-transitions.spec.ts        # playwright smoke: empty→first message morph + drawer
```

Estimated diff: ~250 lines added, ~60 lines changed.

## Verification plan

1. `pnpm typecheck` — must pass; we add a generic `SaiViewTransitionProps` so TS catches misuse.
2. `pnpm lint` — must pass.
3. `pnpm test` — mocha covers the three branches of the wrapper (flag on+supported, flag on+unsupported, flag off).
4. `pnpm build` — must pass; flag is bundled into client env, no runtime branching surprise.
5. Manual smoke (not automatable in this session): empty thread → submit first message; open detail drawer; send message in SaiSearch idle → see composer morph into bubble.

## Out of scope (explicitly)

- Route-change transitions (Next 16 surface is in flux; revisit after `next/view-transitions` stabilizes).
- Animation framework swap (we keep `framer-motion` for the idle flip; no reason to churn).
- Touch devices — the skill's notes flag Safari iOS gaps; we treat any `!supportsViewTransitions()` browser as unsupported.
- Wider dashboard navigation — per your scope answer.