# Remove blue-tick verification / Razorpay payment gateway entirely

## Request
"now i'm thinking that my app is almost complete and ready to deploy so i just wanted to get the exposure of a payment gateway i get it now remove it because deploying an incomplete project will not make any sense." Confirmed via follow-up question: remove everything, not just the payment flow — the `isVerified` flag and the badge UI too, since without a way to earn it the badge would be permanently dead weight.

## Before
The blue-tick feature (`docs/architecture/blue-tick-verification-system.md`) was fully built across 5 phases: a Razorpay subscription/checkout flow, a signed webhook that flipped `User.isVerified`, and a badge shown in ~9 places across the app (profile, posts, comments, notifications, follow requests, chat list/header, explore search, call overlay). It worked, but was blocked on a real Razorpay production account and needed a manual workaround (a scratchpad script firing signed webhooks by hand) to test reliably — not something to ship half-working.

## Implemented

### Backend
- Deleted `server/src/subscriptions/` entirely (controller, service, Razorpay wrapper, DTOs, module).
- Removed `SubscriptionsModule` from `app.module.ts`, and the now-unneeded `{ rawBody: true }` Nest option in `main.ts` (it existed solely so the webhook could verify Razorpay's HMAC signature over raw bytes).
- Uninstalled the `razorpay` npm package.
- Removed `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_BLUE_TICK_PLAN_ID`, `RAZORPAY_WEBHOOK_SECRET` from `server/.env`.
- **Database migration** (`remove_blue_tick_verification`): dropped the `isVerified` column from `User` and the entire `Subscription` table (+ its `SubscriptionStatus` enum and foreign key). This was a real, confirmed-with-you destructive change — it permanently deleted 11 users' `isVerified: true` values and 3 real `Subscription` rows from the live Neon database.
- Removed `isVerified` from every `select`/`include` that used to expose it: `users.service.ts`, `posts.service.ts` (5 places), `stories.service.ts`, `chat.service.ts`, `follow.service.ts`, `notifications.service.ts`, `calls.service.ts`.

### Frontend
- Deleted `components/verify-button.tsx` and `components/verified-badge.tsx`.
- Removed the "Get Verified" button and badge from the own-profile action row (`profile/[username]/page.tsx`).
- Removed the `isVerified` field and `<VerifiedBadge>` usage from every other surface that rendered it: `post-card.tsx`, `post-modal.tsx`, `comment-section.tsx`, `share-modal.tsx`, `explore/page.tsx`, `story-viewer.tsx`, `notifications/page.tsx`, `chat/page.tsx`, `chat/[username]/page.tsx`, `profile/requests/page.tsx`, `call-overlay.tsx`, `useCall.ts`.

## Files changed
Backend: `app.module.ts`, `main.ts`, `prisma/schema.prisma` (+ new migration), `users/users.service.ts`, `posts/posts.service.ts`, `stories/stories.service.ts`, `chat/chat.service.ts`, `follow/follow.service.ts`, `notifications/notifications.service.ts`, `calls/calls.service.ts`, `.env`, `package.json`. Deleted: `subscriptions/` (whole module).

Frontend: `profile/[username]/page.tsx`, `post-card.tsx`, `post-modal.tsx`, `comment-section.tsx`, `share-modal.tsx`, `explore/page.tsx`, `story-viewer.tsx`, `notifications/page.tsx`, `chat/page.tsx`, `chat/[username]/page.tsx`, `profile/requests/page.tsx`, `call-overlay.tsx`, `useCall.ts`. Deleted: `verify-button.tsx`, `verified-badge.tsx`.

## Verification
`npx tsc --noEmit` clean on both projects after every stage of removal. Server boots clean with no `/subscriptions` routes registered. Playwright pass against the live app: own profile shows no "Get Verified" text and no badge (screenshot confirmed); `POST /subscriptions/checkout` returns `404` (route genuinely gone, not just hidden); regression-checked that home feed, notifications, explore search, and the settings page (built in an earlier, unrelated change) all still return `200` and render correctly — confirming the removal didn't collaterally break anything else.

## Note
This decision was made deliberately, not because the feature was broken — Phases 1-5 were fully implemented and Phase 3 (the webhook) was proven working end-to-end. It was removed because shipping a payment flow gated on a Razorpay production account that doesn't exist yet doesn't make sense for a first deploy; `docs/architecture/blue-tick-verification-system.md` is left in place as a historical record of that work, not as documentation of a currently-running feature.
