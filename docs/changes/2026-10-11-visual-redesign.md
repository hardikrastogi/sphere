# Visual redesign - move away from the Instagram look

## Request
"since my app looks almost exactly like a instagram just naming is changed... tell me how can i make it different from instagram." Follow-up, after discussing the options: "basically its about the ui change no major change is required so start redesigning it" - UI/visual only, no changes to navigation structure, feed layout, or any functionality.

## Before
Every design token in `globals.css` was pure grayscale (`oklch(... 0 0)` - zero chroma, no hue at all), which is exactly Instagram's black/white/gray minimalism. On top of that: perfectly circular avatars everywhere (Instagram's signature shape), the story ring used Instagram's literal `from-blue-500 via-cyan-500 to-violet-500` rainbow gradient, posts were edge-to-edge list items separated by a thin `border-b` (Instagram's exact feed chrome), the bottom nav had no active-state treatment beyond a color swap, and the body font was Inter (an extremely common "default app" font with no personality).

## Implemented

### Design tokens (`globals.css`) - highest-leverage change, affects every component automatically
- Replaced the 0-chroma grayscale palette with a violet-hued one (`primary` at oklch hue ~293, matching Sphere's actual logo color) for both light and dark mode. Backgrounds, cards, borders, and muted text all now carry a faint consistent violet tint instead of being neutral gray.
- `--radius` raised from `0.625rem` to `1.1rem` - every `rounded-md/lg/xl` usage across the whole app (derived from this one variable) is now softer and bubblier.
- Because every existing component already used the shared tokens (`bg-primary`, `text-foreground`, `border-border`, etc.) rather than hardcoded colors, this one file change re-themes buttons, inputs, switches, and every page with zero per-component edits.

### Typography (`layout.tsx`)
- Swapped Inter for Plus Jakarta Sans (`next/font/google`) - a rounder, more distinctive geometric sans, so the app's type doesn't read as the same generic font Instagram and a thousand other apps use.

### Shape language (`components/ui/avatar.tsx`)
- Changed every avatar (image, fallback initial, group-count bubble) from `rounded-full` to `rounded-xl` - squircles instead of circles. Since every avatar in the app goes through this one shared component, this single edit changed the avatar shape on the profile page, post cards, chat, comments, notifications, follow requests, and the call overlay all at once.

### Stories bar (`components/stories-bar.tsx`)
- Story ring gradient changed from Instagram's literal `blue -> cyan -> violet` rainbow to a two-tone brand gradient (`from-primary via-fuchsia-500 to-accent-foreground`).
- Ring and "add story" dashed-circle wrappers changed from `rounded-full` to `rounded-2xl` to match the new squircle avatars inside them.

### Post card (`components/post-card.tsx`, `post-modal.tsx`)
- Changed from an edge-to-edge list item with a thin bottom border to a floating card: `rounded-3xl`, `border`, `shadow-sm`, its own `bg-card` surface, and margin between posts. This is the single biggest visual break from Instagram's feed chrome.
- Action-row icons (like/comment/share) now sit in rounded hover targets instead of bare icons.
- Removed the redundant outer wrapper in `post-modal.tsx` now that `PostCard` carries its own card chrome.

### Home feed container (`home/page.tsx`)
- Added horizontal padding around the post list so the new floating cards have breathing room from the screen edges instead of touching them.

### Bottom nav (`components/bottom-nav.tsx`)
- The active tab now gets a rounded pill highlight (`bg-accent`) behind the icon, instead of Instagram's plain "icon changes color" treatment.

## Files changed
`client/src/app/globals.css`, `client/src/app/layout.tsx`, `client/src/components/ui/avatar.tsx`, `client/src/components/stories-bar.tsx`, `client/src/components/post-card.tsx`, `client/src/components/post-modal.tsx`, `client/src/components/bottom-nav.tsx`, `client/src/app/(main)/home/page.tsx`.

## Scope note
This was deliberately a visual-only pass, as requested - no navigation structure, feed pagination, data model, or feature behavior changed. Grid views (explore, profile posts grid) still render raw square media tiles rather than `PostCard`, so they were unaffected by the card redesign - that's consistent with how Instagram's own grid works too, so it wasn't a target for differentiation.

## Verification
`npx tsc --noEmit` clean. Frontend-only change, so verified directly against the already-running dev server via Next's hot reload (no restart needed). Playwright screenshots confirm: login screen shows the new violet primary button and Plus Jakarta Sans type; profile page shows squircle avatars and pill-shaped action buttons; home feed shows floating rounded post cards with shadows, the new story-ring gradient, and the pill-highlighted active nav tab - in both light and dark mode, each with its own correctly-tinted violet background rather than pure black/white.
