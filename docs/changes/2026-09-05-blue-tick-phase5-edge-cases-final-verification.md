# Blue Tick Verification Phase 5: Edge Cases + Final Verification

## Before

Phases 1-4 built and verified the full feature - checkout, webhook, badge everywhere. Two gaps had been explicitly flagged along the way rather than fixed: Phase 1's docs noted "a user who cancels and later wants to resubscribe isn't handled yet," and no protection existed against a double-click racing two checkout requests.

## Requested

Complete Phase 5: close the flagged edge cases and do a final combined verification pass across the whole feature.

## Implemented

### The resubscribe gap (`subscriptions.service.ts`)

```ts
// before
async createCheckoutForUser(userId: string) {
  const existing = await this.prisma.subscription.findUnique({ where: { userId } });
  if (existing) return existing; // returns a dead CANCELLED/HALTED row forever

// after
const LIVE_STATUSES = ['CREATED', 'ACTIVE'] as const;

async createCheckoutForUser(userId: string) {
  const existing = await this.prisma.subscription.findUnique({ where: { userId } });
  if (existing && (LIVE_STATUSES as readonly string[]).includes(existing.status)) return existing;

  const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const customer = await this.razorpay.createCustomer({ name: user.username, email: user.email });
  const subscription = await this.razorpay.createSubscription({ planId: process.env.RAZORPAY_BLUE_TICK_PLAN_ID!, userId });

  const data = { razorpayCustomerId: customer.id, razorpaySubscriptionId: subscription.id, status: 'CREATED' as const, currentPeriodEnd: null };

  try {
    return existing
      ? await this.prisma.subscription.update({ where: { userId }, data })
      : await this.prisma.subscription.create({ data: { userId, ...data } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return this.prisma.subscription.findUniqueOrThrow({ where: { userId } });
    }
    throw err;
  }
}
```

### Concurrent double-click

Same change as above handles this: two requests racing past the `findUnique` check both attempt a write, but `userId` is `@unique`, so the loser hits Postgres's unique-violation (`P2002`) instead of crashing - now caught and turned into "re-fetch and return whatever the winner created," rather than a `500`.

## Verification

1. Seeded `CANCELLED` and `HALTED` rows - confirmed checkout no longer returns the stale id, and correctly attempts a fresh Razorpay call each time (same `500` credential boundary as every other outbound path, proving it got past the early-return).
2. Seeded `ACTIVE` and `CREATED` rows - confirmed checkout returns the existing subscription id untouched, with no Razorpay call attempted at all (clean `201`, not a `500`).
3. Manually triggered a duplicate-`userId` insert directly against Postgres to confirm `P2002` really is the error code the `catch` block is watching for.
4. Full combined pass: webhook `activated` → badge appears on the profile page; the *same* event delivered twice → stays `ACTIVE`, no duplicate side effects (confirms the handler is naturally idempotent under Razorpay's at-least-once delivery); webhook `cancelled` → badge disappears.
5. Regression check: since Phase 4 touched `select`/`include` clauses across five service files, re-verified post creation, liking, commenting, the notifications page, and the chat conversations list all still work.
6. `npx tsc --noEmit` clean on both projects.

## Still open

Real Razorpay test credentials are still the only thing blocking end-to-end verification of the actual "pay and see the badge" checkout experience - everything else in the feature is now fully proven independently. Out-of-order webhook delivery protection was deliberately not built (documented as a conscious scope boundary in the architecture doc, not an oversight) - not worth the added complexity for a single-badge, ₹99/month feature at this scale.

This closes the video-calling-style phase-by-phase roadmap for the blue-tick verification feature - all 5 phases are now implemented, and all but the outbound Razorpay checkout call have been verified against the real running app and database.
