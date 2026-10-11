# Blue Tick Verification Phase 2: Frontend Checkout Flow

## Before

Phase 1 built the backend: `POST /subscriptions/checkout` correctly creates a Razorpay Customer + Subscription and persists a row, but nothing in the frontend called it. No UI existed to start a subscription, and no profile data even exposed whether a user was verified.

## Requested

Implement Phase 2: the frontend checkout flow that actually lets a user pay for the badge.

## Implemented

### `GET /users/:username` now returns `isVerified`

```ts
// server/src/users/users.service.ts
select: { id: true, username: true, bio: true, avatarUrl: true, createdAt: true, isVerified: true },
```

### New `client/src/components/verify-button.tsx`

```tsx
function loadRazorpayScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) return resolve();
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Razorpay checkout'));
    document.body.appendChild(script);
  });
}

// on click: POST /subscriptions/checkout -> load script -> open widget
const razorpay = new window.Razorpay({
  key: keyId,
  subscription_id: subscriptionId,
  name: 'Sphere',
  description: 'Blue Tick - Monthly Verification',
  handler: () => {
    toast.success("Payment received - your badge will appear once it's confirmed.");
  },
  modal: { ondismiss: () => setWidgetOpen(false) },
});
razorpay.on('payment.failed', () => toast.error('Payment failed - please try again.'));
razorpay.open();
```

The script is injected on demand (only when the button is actually clicked), not loaded on every page view.

### Wired into `/profile/[username]/page.tsx`

- Added `isVerified: boolean` to the `Profile` interface.
- Self-profile action row: shows `<VerifyButton />` when `!profile.isVerified`.
- Username row: shows a small `BadgeCheck` icon when `profile.isVerified` is true.

This is intentionally a single-page, minimal rendering - showing the badge everywhere a username appears (chat, posts, comments) is Phase 4 scope.

## The one rule this phase is built around

The widget's success `handler()` callback **never** sets `isVerified`. It only shows a toast telling the user their payment was received and the badge will appear once confirmed. Trusting a client-side callback to unlock a paid feature is exactly the kind of thing that gets abused (spoofed calls, intercepted responses, a user just closing the tab after the redirect). The webhook in Phase 3 is the only path allowed to flip `isVerified` - this phase deliberately does nothing more than start the payment and report the *attempt*, not the outcome.

## How it works — request flow

1. User on their own profile clicks "Get Verified".
2. `VerifyButton` calls `POST /subscriptions/checkout` → gets back `{ subscriptionId, keyId }` (Phase 1's endpoint, unchanged).
3. Razorpay's Checkout.js script loads (if not already present) and opens a widget pre-configured with that subscription.
4. User pays / authorizes a UPI Autopay or card mandate inside the widget.
5. On success, the widget's `handler()` fires client-side — shown as a toast only. Razorpay separately (and independently of this browser tab) sends a webhook to the backend, which Phase 3 will use to actually grant the badge.

## Verification

1. `npx tsc --noEmit` clean on both projects.
2. Logged in, opened own profile, confirmed the "Get Verified" button renders correctly.
3. Clicked it - confirmed the checkout call fires and, with the still-placeholder Razorpay keys, correctly surfaces "Could not start checkout - please try again." instead of crashing, hanging, or silently failing.
4. Cannot verify the widget itself opening/completing a payment without real Razorpay test credentials - same blocker as Phase 1.

## Still open

Real Razorpay test credentials still needed (see Phase 1's change-summary doc for the exact steps) before Phases 1-2 can be verified end-to-end. Phase 3 (webhook - the only thing that grants the badge), Phase 4 (badge UI everywhere), Phase 5 (edge cases + final verification) not started.
