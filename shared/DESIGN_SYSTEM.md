# Sastram Design System Reference

> Extracted from `app/globals.css`, `components.json`, `tailwind.config`, and
> the landing/login page source. **Every UI change in this codebase must use
> these tokens.** Do not introduce new colors, font sizes, or spacing values
> outside this set without an explicit call-out.

---

## Brand Identity

| Token | Value | Usage |
|-------|-------|-------|
| `--brand` / `text-brand` / `bg-brand` | `#3736fc` | Primary CTA, links, active states, badges |
| `--brand-hover` | `#2c2be0` | Brand color on hover |
| `--blue` | `#3736fc` | Alias for brand — thread page design system |
| `--blue-light` | `#eeeeff` | Brand tint backgrounds (light mode) |
| `--blue-dim` | `rgba(55,54,252,0.08)` light / `rgba(55,54,252,0.18)` dark | Subtle brand fill |

**Rule:** Never use raw `blue-500`, `indigo-*`, or any Tailwind blue unless it
maps to one of these tokens. Brand identity must always resolve to `#3736fc`.

---

## Color Tokens (CSS variables → Tailwind classes)

### Semantic surfaces

| CSS var | Tailwind class | Light value | Dark value | Use for |
|---------|---------------|------------|-----------|---------|
| `--background` | `bg-background` | `oklch(0.99 0.002 264)` | `oklch(0.1 0.004 264)` | Page background |
| `--foreground` | `text-foreground` | `oklch(0.16 0.006 264)` | `oklch(0.97 0.002 264)` | Body text |
| `--card` | `bg-card` | `oklch(1 0 0)` | `oklch(0.145 0.005 264)` | Card surfaces |
| `--popover` | `bg-popover` | `oklch(1 0 0)` | `oklch(0.145 0.005 264)` | Popovers, dropdowns |
| `--primary` | `bg-primary` / `text-primary` | `oklch(0.16 0.006 264)` | `oklch(0.97 0.002 264)` | Primary buttons |
| `--secondary` | `bg-secondary` | `oklch(0.965 0.003 264)` | `oklch(0.185 0.006 264)` | Secondary buttons, icon bg |
| `--muted` | `bg-muted` | `oklch(0.965 0.003 264)` | `oklch(0.185 0.006 264)` | Muted backgrounds |
| `--muted-foreground` | `text-muted-foreground` | `oklch(0.5 0.012 264)` | `oklch(0.63 0.014 264)` | Placeholder, meta text |
| `--accent` | `bg-accent` | `oklch(0.955 0.014 264)` | `oklch(0.21 0.02 264)` | Hover states |
| `--border` | `border-border` | `oklch(0.91 0.005 264)` | `oklch(1 0 0 / 8%)` | All borders |
| `--input` | `border-input` | `oklch(0.91 0.005 264)` | `oklch(1 0 0 / 10%)` | Input borders |
| `--ring` | `ring-ring` | `oklch(0.45 0.19 264)` | `oklch(0.58 0.2 264)` | Focus rings |
| `--destructive` | `text-destructive` / `bg-destructive` | `oklch(0.62 0.21 25)` | `oklch(0.69 0.19 22)` | Errors, delete actions |
| `--sidebar` | `bg-sidebar` | `oklch(0.975 0.003 264)` | `oklch(0.085 0.004 264)` | Sidebar background |

### Semantic status colors

| CSS var | Light | Dark | Use for |
|---------|-------|------|---------|
| `--green` | `#1a9c5c` | `#3dd68c` | Resolved, success states |
| `--amber` | `#d99a1b` | `#f2b544` | Partially resolved, stale, warnings |
| `--red` | `#e5484d` | `#f2555a` | Disputed, errors, destructive |
| `--muted` (thread page) | `#6b6b76` | `#8a8f98` | Supporting text |

### Raw thread-page variables (use in thread views)

| CSS var | Light | Dark |
|---------|-------|------|
| `--bg` | `#fafafb` | `#08090a` |
| `--surface` | `#ffffff` | `#131316` |
| `--text` | `#0e0e10` | `#f2f2f4` |

---

## Typography

| Stack | Font | Tailwind token |
|-------|------|---------------|
| Sans (body, UI) | Geist Sans | `font-sans` → `var(--font-geist-sans)` |
| Mono (code) | Geist Mono | `font-mono` → `var(--font-geist-mono)` |
| Serif (headings / display) | Instrument Serif | `.font-serif-heading` → `var(--font-instrument-serif)` |

**Scale in use across the codebase:**
- `text-[10px]` / `text-[11px]` — micro labels, caps badges
- `text-xs` (12px) — meta, timestamps, tag labels
- `text-sm` (14px) — body, list items
- `text-base` (16px) — default prose
- `text-lg` — card titles
- `text-xl` / `text-2xl` — metric values, section headings
- `text-4xl` — page h1

**Do not introduce** `text-3xl`, `text-5xl`, or larger outside display contexts.

**Tracking in use:** `tracking-wider`, `tracking-widest` on uppercase labels/badges only.

---

## Radius

| Token | Value | Tailwind | Use for |
|-------|-------|---------|---------|
| `--radius` | `0.75rem` (12px) | `rounded-xl` | Cards, modals, primary containers |
| `--radius-sm` | `0.5rem` (8px) | `rounded-lg` | Buttons, inputs, small chips |
| `--radius-md` | `0.625rem` (10px) | `rounded-[10px]` | Mid-sized containers |
| `--radius-xl` | `1rem` (16px) | `rounded-2xl` | Large panels, hero elements |
| `rounded-full` | 9999px | — | Pills, avatars, badges |

---

## Shadows (elevation system)

Use shadow utilities instead of extra borders for elevation. Additive with `border-border`.

| Class | Use for |
|-------|---------|
| `.shadow-linear-xs` | Subtle lift (avatar, chip) |
| `.shadow-linear-sm` | Input fields, small cards |
| `.shadow-linear-md` | Popovers, dropdowns |
| `.shadow-linear-lg` | Modals, command palettes |
| `.shadow-linear-xl` | Full overlays |

---

## Spacing rhythm

Gaps and padding follow an 4px base grid. In-use values:
- `gap-2` (8px) — inline elements, icon-to-label
- `gap-3` (12px) — form fields, compact lists
- `gap-4` (16px) — card internals, section items
- `gap-6` (24px) — section-to-section, grid columns
- `gap-10` (40px) — major page sections
- `p-4` / `p-5` (16/20px) — card padding
- `px-4 py-2` — button padding

---

## Utility classes (bespoke, documented here)

| Class | Effect |
|-------|--------|
| `.admin-header-gradient` | Dark radial gradient for admin/dashboard headers |
| `.bg-thread-cover` | Dot-grid background pattern for thread cover areas |
| `.landing-marquee` / `.landing-marquee-track` | Marquee strip with fade masks |
| `.font-serif-heading` | Applies Instrument Serif font family |
| `.skeleton` | Pulsing skeleton loader using `--secondary` |
| `.shadow-linear-*` | Shadow elevation utilities (see above) |

---

## Animation tokens (transitions-dev system)

All transitions use CSS custom properties — **do not hard-code durations or easings**.

| Category | Key vars |
|----------|---------|
| Resize | `--resize-dur: 300ms`, `--resize-ease` |
| Dropdown | `--dropdown-open-dur: 250ms`, `--dropdown-close-dur: 150ms`, `--dropdown-ease` |
| Modal | `--modal-open-dur: 250ms`, `--modal-close-dur: 150ms`, `--modal-ease` |
| Panel | `--panel-open-dur: 400ms`, `--panel-ease` |
| Page slide | `--page-slide-dur: 200ms`, `--page-fade-dur: 200ms` |

All easing: `cubic-bezier(0.22, 1, 0.36, 1)` (standard decelerate).  
Spring variants: `cubic-bezier(0.34, 1.45, 0.64, 1)` (digit pop, badge pop).

---

## shadcn/ui component variants in use

From `components.json`: `style: "new-york"`, `baseColor: "zinc"`, `cssVariables: true`.

Key variants observed in codebase:
- `Button` — default (primary), `variant="ghost"`, `variant="outline"`, `size="sm"`, `size="icon"`
- `Card` / `CardContent` — default with `p-5` internal padding
- `Badge` — default, custom `bg-brand/10 text-brand border-brand/20` pattern
- `Skeleton` — used for all loading states
- `Dialog` / `DialogContent` — modals
- `Tabs` / `TabsList` / `TabsTrigger` — section navigation

**Pattern for brand badges:**
```tsx
<span className="bg-brand/10 text-brand text-[10px] font-bold px-2 py-0.5 rounded-full border border-brand/20">
  LABEL
</span>
```

---

## Do-not-touch surfaces

These pages/components are the design reference and **must not be restyled**:
- `app/page.tsx` + `components/landing/LandingPage.tsx`
- `app/(public)/login/page.tsx`

If a change here is strictly required (e.g. removing "Community" copy), diff must be minimal.
