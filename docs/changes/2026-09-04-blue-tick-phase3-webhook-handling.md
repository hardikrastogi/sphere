# Blue Tick Verification Phase 3: Webhook Handling

## Before

Phases 1-2 could create a Razorpay subscription and open the Checkout widget, but nothing ever set `User.isVerified`. A successful payment had no path to actually grant the badge - the whole point of routing this through a webhook rather than trusting the client (established explicitly as a rule in Phase 2) had no implementation yet.

## Requested

Implement Phase 3: the webhook endpoint that verifies Razorpay's signature and is the only thing allowed to flip `isVerified`.

## Implemented

### Raw body capture (`server/src/main.ts`)

```ts
// before
const app = await NestFactory.create(AppModule);

// after
const app = await NestFactory.create(AppModule, { rawBody: true });
```

Needed because HMAC signature verification must run over Razorpay's *exact* raw bytes - a re-serialized copy of the parsed JSON (different key order, whitespace) would never match the signature Razorpay computed.

### `razorpay.service.ts` — signature verification

```ts
verifyWebhookSignature(rawBody: string, signature: string | undefined): boolean {
  if (!signature) return false;
  return Razorpay.validateWebhookSignature(rawBody, signature, process.env.RAZORPAY_WEBHOOK_SECRET!);
}
```

Wraps the SDK's own function rather than reimplementing HMAC - confirmed against its actual source (`node_modules/razorpay/dist/utils/razorpay-utils.js`) that it's a plain `crypto.createHmac('sha256', secret).update(body).digest('hex')` compared with `===`.

### `subscriptions.service.ts` — the only place `isVerified` is written

```ts
async handleWebhookEvent(event: string, subscriptionEntity: { id: string; current_end?: number }) {
  const sub = await this.prisma.subscription.findUnique({ where: { razorpaySubscriptionId: subscriptionEntity.id } });
  if (!sub) return; // not ours, or a stale replay - not an error

  if (event === 'subscription.activated' || event === 'subscription.charged') {
    await this.prisma.$transaction([
      this.prisma.subscription.update({
        where: { id: sub.id },
        data: { status: 'ACTIVE', currentPeriodEnd: subscriptionEntity.current_end ? new Date(subscriptionEntity.current_end * 1000) : sub.currentPeriodEnd },
      }),
      this.prisma.user.update({ where: { id: sub.userId }, data: { isVerified: true } }),
    ]);
    return;
  }

  if (event === 'subscription.halted' || event === 'subscription.cancelled' || event === 'subscription.completed') {
    const status = event === 'subscription.cancelled' ? 'CANCELLED' : event === 'subscription.completed' ? 'COMPLETED' : 'HALTED';
    await this.prisma.$transaction([
      this.prisma.subscription.update({ where: { id: sub.id }, data: { status } }),
      this.prisma.user.update({ where: { id: sub.userId }, data: { isVerified: false } }),
    ]);
  }
}
```

### `subscriptions.controller.ts` — the endpoint

```ts
@Post('webhook')
@HttpCode(200)
async webhook(@Req() req: RawBodyRequest<Request>, @Headers('x-razorpay-signature') signature?: string) {
  const rawBody = req.rawBody?.toString() ?? '';
  if (!this.razorpayService.verifyWebhookSignature(rawBody, signature)) {
    throw new UnauthorizedException('Invalid webhook signature');
  }
  const body = JSON.parse(rawBody);
  const subscriptionEntity = body?.payload?.subscription?.entity;
  if (subscriptionEntity) {
    await this.subscriptionsService.handleWebhookEvent(body.event, subscriptionEntity);
  }
  return { received: true };
}
```

No auth guard - this route is called by Razorpay's servers, not a logged-in browser session. The signature check is what stands in for auth here.

## A real bug found and fixed during verification

Every webhook call - even ones with a correct signature - initially failed with a `500`. Root cause: the running dev server process had booted *before* `RAZORPAY_WEBHOOK_SECRET` was added to `.env`, so it saw `undefined`, and the Razorpay SDK's `validateWebhookSignature` throws synchronously when any argument is undefined - surfacing as an uncaught 500 instead of a clean 401. Compounding the confusion: `nest start --watch` on this machine doesn't reliably keep piping a respawned child process's stdout to the same captured log file across restarts, so the background log looked frozen on an old snapshot while the live server had actually moved forward. Fixed by doing a full manual kill on the port and a fresh restart, rather than trusting the watcher's silent respawn.

**How to detect this yourself in future**: if a `curl`/browser response doesn't match what the code obviously should do, and the background dev-server log hasn't printed anything new in a while, don't trust the log - kill the process on the port directly and restart clean before debugging further.

## API map (updated)

| Endpoint | Auth | Handler | Purpose |
|---|---|---|---|
| `POST /subscriptions/checkout` | JWT-guarded | `SubscriptionsController.checkout` | Unchanged from Phase 1 |
| `POST /subscriptions/webhook` | Signature-verified, no JWT | `SubscriptionsController.webhook` → `SubscriptionsService.handleWebhookEvent` | **New.** The only path that ever sets `User.isVerified` |

## Verification

All done without needing real Razorpay credentials - a webhook call is just an HTTP POST with a signature computed the same way regardless of whether the account behind it is real:
1. Seeded a `CREATED` `Subscription` row directly in Postgres for a real test user.
2. Invalid signature → `401`, confirmed no DB change.
3. Valid `subscription.activated` → `Subscription.status: ACTIVE` with correct `currentPeriodEnd`, **and** `User.isVerified: true`.
4. Valid `subscription.charged` (renewal) → stayed `ACTIVE`, `currentPeriodEnd` correctly advanced.
5. Valid `subscription.cancelled` → `status: CANCELLED`, `User.isVerified: false`.
6. Valid signature but an unknown subscription id → clean `200`, no DB write, no crash (avoids Razorpay's retry-on-non-2xx behavior for events that aren't ours).
7. `npx tsc --noEmit` clean.

## Still open

Phases 1-2's outbound checkout flow still needs real Razorpay test credentials to verify end-to-end (Phase 3's webhook side is now fully proven independently). Phase 4 (badge UI everywhere a username appears) and Phase 5 (edge cases + final verification) not started.
