# Sphere logo — login/signup + top-left app header

## Request
"i have a logo for this app i want this logo to appear on the login page to home page: 1) on login page it should be in the center just above the login details, 2) after login page that logo with a text 'Sphere' should be visible on the top left corner of the pages just like instagram."

Follow-up: use the logo in black/white only, color switching automatically with light/dark mode; and a short one-time intro animation when the logo first appears on the login/signup page.

## A note on the logo asset
The logo was shared as images in chat (a brand style-guide screenshot and an app-icon mockup), not as an actual file on disk — I only have a rendered preview of it, not the underlying vector/pixel data, so I couldn't import the exact original asset. I hand-built an SVG recreation (`LogoMark`) matching the two-petal "S" silhouette as closely as I could from the screenshots. It's a close approximation, not a pixel-perfect import — if you have the real `.svg`/`.png` export from your design file, drop it in and I'll swap `LogoMark`'s internals for it directly (the rest of the wiring — placement, animation, color-switching — stays the same).

## Implemented
- **`client/src/components/logo.tsx`**: `LogoMark` (icon-only, SVG using `fill="currentColor"`) and `Logo` (icon + "Sphere" wordmark, for the app header). Because it's `currentColor`-based, color is controlled purely by the wrapping element's text color (`text-black dark:text-white`) — no JS theme-detection needed, so it can never be out of sync with the current theme, including on first paint.
- **`globals.css`**: added `@keyframes logo-intro` (scale 0.6→1.08→1 with a fade-in, ~0.6s). Applied only on the login/signup pages via an inline `[animation:...]` class — it's a plain CSS animation tied to the element's mount, so it plays once when the page loads and never repeats (no flag/state needed, and it doesn't replay on typing/interaction since the element isn't remounted).
- **Login & signup pages**: `LogoMark` added centered above the form, with the intro animation.
- **`client/src/components/top-bar.tsx`**: new `TopBar` component — sticky, bordered header showing the full `Logo` (icon + wordmark), top-left.
- **Home page**: `TopBar` added above the stories bar (and shown even during the loading/error/empty states now, since those were early-returning before the header could render — restructured the page's conditional rendering so the header is always present, matching Instagram, where the header stays fixed regardless of feed state).

### Scope note
The top-left header was added to the **Home** page specifically, matching Instagram's own behavior — Instagram doesn't repeat its wordmark on Explore, Profile, Notifications or DMs; those already have their own title bars (or a search bar, in Explore's case) here in Sphere too. Let me know if you'd like it added to other pages as well.

## Files changed
- `client/src/components/logo.tsx` (new)
- `client/src/components/top-bar.tsx` (new)
- `client/src/app/globals.css` — added `logo-intro` keyframes
- `client/src/app/(auth)/login/page.tsx`
- `client/src/app/(auth)/signup/page.tsx`
- `client/src/app/(main)/home/page.tsx`

## Verification
Playwright screenshots: logo renders centered above the form on login (light mode, black) and dark mode (white); `TopBar` renders top-left on the home feed in both light and dark mode, color correctly following the theme in each case. `npx tsc --noEmit` clean. No backend changes, so no server restart was needed — verified directly against the already-running dev server via Next's hot reload.
