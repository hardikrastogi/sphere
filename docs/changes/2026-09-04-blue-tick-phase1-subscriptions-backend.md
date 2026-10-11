# Blue Tick Verification Phase 1: Subscriptions Backend

## Before

No paid-verification feature existed. `User` had no notion of a subscription or verified status.

## Requested

Implement Phase 1 of the blue-tick roadmap: the DB model, Razorpay test-account setup, and a backend endpoint that creates a subscription. Locked in Phase 0: Razorpay, test mode only, ₹99/month, badge-only (no other perks).

## Implemented

### Schema (`server/prisma/schema.prisma`)

```prisma
// added to User
isVerified            Boolean        @default(false)
subscription          Subscription?

// new model
enum SubscriptionStatus {
  CREATED
  ACTIVE
  HALTED
  CANCELLED
  COMPLETED
}

model Subscription {
  id                     String             @id @default(cuid())
  userId                 String             @unique
  user                   User               @relation(fields: [userId], references: [id], onDelete: Cascade)
  razorpayCustomerId     String
  razorpaySubscriptionId String             @unique
  status                 SubscriptionStatus
  currentPeriodEnd       DateTime?
  createdAt              DateTime           @default(now())
  updatedAt              DateTime           @updatedAt
}
```

Migration `add_subscription_model` applied cleanly against the live Neon DB.

### New `server/src/subscriptions/` module

```ts
// razorpay.service.ts
createCustomer(params: { name: string; email: string }) {
  return this.client.customers.create({ ...params, fail_existing: 0 });
}

createSubscription(params: { planId: string; userId: string }) {
  return this.client.subscriptions.create({
    plan_id: params.planId,
    customer_notify: 1,
    total_count: 120,
    notes: { userId: params.userId },
  });
}
```

```ts
// subscriptions.service.ts
async createCheckoutForUser(userId: string) {
  const existing = await this.prisma.subscription.findUnique({ where: { userId } });
  if (existing) return existing;

  const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const customer = await this.razorpay.createCustomer({ name: user.username, email: user.email });
  const subscription = await this.razorpay.createSubscription({
    planId: process.env.RAZORPAY_BLUE_TICK_PLAN_ID!,
    userId,
  });

  return this.prisma.subscription.create({
    data: { userId, razorpayCustomerId: customer.id, razorpaySubscriptionId: subscription.id, status: 'CREATED' },
  });
}
```

```ts
// subscriptions.controller.ts
@UseGuards(AuthGuard('jwt'))
@Post('checkout')
async checkout(@Req() req: any) {
  const subscription = await this.subscriptionsService.createCheckoutForUser(req.user.userId);
  return { subscriptionId: subscription.razorpaySubscriptionId, keyId: process.env.RAZORPAY_KEY_ID };
}
```

Registered as `SubscriptionsModule` in `app.module.ts`, same pattern as every other feature module.

### A crash risk found and fixed along the way

The Razorpay SDK throws synchronously in its constructor when `key_id` is missing, and `RazorpayService` is a normal NestJS provider instantiated eagerly at app boot — so with no Razorpay env vars set, the *entire server* failed to start, not just subscription requests. Confirmed this live: the server crashed with `` Error: `key_id` or `oauthToken` is mandatory `` immediately after adding the module. Fixed by adding placeholder values to `server/.env`:

```
RAZORPAY_KEY_ID=rzp_test_placeholder
RAZORPAY_KEY_SECRET=placeholder_secret
RAZORPAY_BLUE_TICK_PLAN_ID=plan_placeholder
```

These need to be replaced with real values (see "What you need to do" below) — until then, the server boots fine but any actual call to `/subscriptions/checkout` will fail against Razorpay with a real `401 Authentication failed`, which is exactly what was observed in verification.

## API map

| Endpoint | Auth | Handler | Purpose |
|---|---|---|---|
| `POST /subscriptions/checkout` | JWT-guarded | `SubscriptionsController.checkout` → `SubscriptionsService.createCheckoutForUser` | Idempotently creates (or returns the existing) `Subscription` row + Razorpay subscription; returns `{ subscriptionId, keyId }` for the frontend to open Checkout with in Phase 2 |

## Verification

1. `npx prisma migrate dev` — applied cleanly, no drift.
2. `npx tsc --noEmit` — clean.
3. Confirmed the Razorpay SDK's actual TypeScript definitions before writing the code, rather than assuming API shapes — specifically confirmed `fail_existing` is real on Customers, and confirmed the Subscriptions create body has **no** `customer_id` field (so the design correctly treats customer creation as separate bookkeeping, not something linked to the subscription at creation time).
4. Restarted the server, confirmed `POST /subscriptions/checkout` is registered and the app boots cleanly with placeholder keys.
5. Called the endpoint with a real logged-in user's session cookie — reached Razorpay's real test API and got back a genuine `401 Authentication failed` (visible in server logs as `{ statusCode: 401, error: { code: 'BAD_REQUEST_ERROR', description: 'Authentication failed' } }`) — confirms the guard, service, and Razorpay call shape are all correct up to the credential boundary.
6. **Cannot verify further without real credentials**: a successful subscription creation, and the idempotency check actually returning an existing row on a second call.

## What you need to do before Phase 1 can be fully verified

1. Sign up at Razorpay (test mode needs no KYC).
2. Settings → API Keys → generate a test **Key ID** and **Key Secret**.
3. Subscriptions → Plans → create one: ₹99, monthly. Copy the resulting `plan_id`.
4. Replace the three placeholder values in `server/.env` with the real ones.
5. Restart the server — I'll then re-run the checkout call and confirm a real `Subscription` row lands in Postgres and Razorpay's dashboard shows it too.

## Still open

Phases 2 (frontend checkout widget), 3 (webhook handling — this is what actually flips `isVerified`), 4 (badge UI), and 5 (edge cases + final verification) are not started.
