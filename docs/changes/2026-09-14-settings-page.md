# Settings page (three-dot menu)

## Request
"add a setting option in a three dot button on the upper right corner and in the settings put all the app related options in that setting options like acc public or not, dark mode, live activity, how much i spent my time on this app, and in the end log out options etc..."

## Before
- No settings page existed. Dark mode had a standalone toggle button (`ThemeToggle`) sitting inline in the profile action row — no other app-wide option lived anywhere.
- No account-privacy concept existed at all: every account behaved as if private (`getUserPosts`/`getProfile` always required an `ACCEPTED` follow edge to view posts, and every follow request always went to `PENDING` and needed manual approval), with no way to opt out of that.
- No "live activity" / online-status opt-out — presence (`user_online`/`user_offline` socket events, used to show someone as online in chat) always broadcast, no way to hide it.
- No time-tracking of any kind.
- No logout function or endpoint existed anywhere in the app.

## Implemented

### Backend
- `User` model gained `isPrivate Boolean @default(false)` and `showActivityStatus Boolean @default(true)` (migration `add_privacy_and_activity_settings`).
- `PATCH /users/me` (existing endpoint) now also accepts `isPrivate` / `showActivityStatus` via `UpdateUserDto`.
- `UsersService.getProfile` / `getUserPosts`: a target account is now only gated behind the follow-approval flow when `isPrivate` is true. Public accounts (`isPrivate: false`, the default) are viewable by anyone.
- `FollowService.sendRequest`: following a public account is now immediate (`status: 'ACCEPTED'`, no request notification) instead of always going through `PENDING`/approval — matches how Instagram treats public vs. private accounts.
- New `POST /auth/logout` clears the `token` cookie.
- `ChatGateway`: the `user_online`/`user_offline` broadcasts to chat partners are now skipped when the user has `showActivityStatus: false`.

### Frontend
- New `Switch` UI primitive (`components/ui/switch.tsx`), built on `@base-ui/react/switch` (the project's existing headless-UI library — there's no Radix here) to match the rest of `components/ui/*`.
- New `client/src/app/(main)/settings/page.tsx`: back button + "Settings" header, then rows for Private account, Dark mode (now lives here instead of the old standalone button — `theme-toggle.tsx` was deleted since it became dead code), Live activity status, a read-only "Time spent on Sphere" stat, and a Log out button at the bottom with an inline confirm step (tap once to arm, tap "Confirm log out" to actually log out).
- Own-profile page (`profile/[username]/page.tsx`) gained a header row (visible only when `isSelf`) with the username on the left and a three-dot (`MoreVertical`) icon button on the right that links to `/settings`.
- `client/src/lib/time-tracker.ts` + `components/time-tracker.tsx`: a client-side timer (mounted once in the `(main)` layout, so it runs on every authenticated page) that adds 15s to a `localStorage` total every 15s, but only while the tab is actually visible (`document.visibilityState`). Purely device-local — no backend involved, since there was no existing analytics infra to hook into and the ask was "how much I spent my time," not a cross-device stat.

## Request flow
1. On the owner's own profile, tapping the three-dot button navigates to `/settings`.
2. The page fetches `GET /users/me` for the current `isPrivate`/`showActivityStatus` values and reads the running time total from `localStorage`.
3. Toggling Private account or Live activity fires `PATCH /users/me` with just that field; the response replaces the cached query data directly (no refetch needed).
4. Toggling Dark mode calls `next-themes`' `setTheme` directly — same mechanism the old standalone toggle used.
5. Log out: `POST /auth/logout` clears the cookie server-side, then the client redirects to `/login`.

## Verification
Playwright, two real accounts (alex, mia): opened alex's own profile, clicked the three-dot button and confirmed navigation to `/settings`; toggled Private account and verified `GET /users/me` reflects `isPrivate: true`; toggled Dark mode and confirmed the `dark` class is applied to `<html>`; toggled Live activity off and verified `showActivityStatus: false`; confirmed Mia's follow request to now-private alex lands as `PENDING`; reverted alex to public and confirmed Mia's follow request is immediately `ACCEPTED`; logged out and confirmed redirect to `/login` plus a subsequent `401` on `GET /users/me`. `npx tsc --noEmit` clean on both client and server. Screenshot confirms the settings page layout.
