# Blue Tick: Live Credential Rollout - Every Bug and Problem Hit

## Before

Phases 1-5 were built and verified with placeholder Razorpay credentials — the outbound checkout call could reach Razorpay's real API but never complete (blocked at the `401 Authentication failed` credential boundary). Real Razorpay test credentials were the one thing still needed to prove the actual "click, pay, see the badge" flow end-to-end. This doc covers everything that surfaced getting from placeholder keys to a real, working badge.

## 1. Real credentials wired in (`server/.env`)

`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_BLUE_TICK_PLAN_ID`, and `RAZORPAY_WEBHOOK_SECRET` were replaced with real Razorpay test-mode values one at a time, confirming progress at each step: Key ID/Secret took `/subscriptions/checkout` from `401 Authentication failed` to `400 The ID provided is invalid` (proving auth now worked, the plan didn't exist yet). Adding the real Plan ID surfaced the next bug.

## 2. Code bug: `fail_existing: 0` didn't actually return the existing customer

With real keys and a real plan, checkout still failed - `400 Customer already exists for the merchant`. `razorpay.service.ts`'s `createCustomer()` already passed `fail_existing: 0`, documented by Razorpay's own SDK types as "return the existing customer instead of erroring" - the real API rejected it anyway (a customer for that email already existed from earlier credential-testing).

Fixed in `razorpay.service.ts`:

```ts
async createCustomer(params: { name: string; email: string }): Promise<{ id: string }> {
  try {
    return await this.client.customers.create({ ...params, fail_existing: 0 });
  } catch (err: any) {
    if (err?.error?.description === 'Customer already exists for the merchant') {
      return { id: `existing:${params.email}` };
    }
    throw err;
  }
}
```

Safe because `razorpayCustomerId` is pure bookkeeping - the Subscriptions API never takes a `customer_id` at creation time (confirmed against the SDK's own types back in Phase 1), and the webhook handler never reads this field. After this fix, `POST /subscriptions/checkout` returned a real `201` with a real Razorpay subscription id, correctly persisted to Postgres.

## 3. Test-mode payment friction (account configuration, not code)

A chain of dead ends trying to actually complete a payment in Razorpay's Checkout widget, none of them app bugs:

- **UPI Autopay wasn't offered as a payment option at all** - later understood as an account-level Razorpay setting (recurring UPI often needs explicit activation), not something controllable from our code.
- **Generic test card (`4111 1111 1111 1111`) rejected**: "This card is not eligible for recurring payments." One-time-payment test cards and recurring/mandate-eligible test cards are different lists in Razorpay's docs.
- **A real personal card was tried, also rejected** - expected, since Razorpay Test Mode never talks to real card networks at all; only its own dummy test cards are recognized.
- **A second "official" test card also failed** with the identical recurring-ineligible error - at this point the pattern (every card fails, UPI isn't even offered) pointed to card-based recurring simply not being enabled for this test account, rather than a wrong card number.
- Fell back to **EMandate** (bank-account-based NACH mandate) - the one method that didn't error. Required a dummy account number, a syntactically valid-format IFSC code (`HDFC0000001`), and clicking through a simulated bank authentication screen with fake credentials.

## 4. Real payment completed, but the webhook never arrived (ngrok)

A real EMandate payment completed - genuine "Payment Successful" screen, a real payment id, a `Paid` order visible in Razorpay's own dashboard. But `Subscription.status` stayed `CREATED` and nothing hit `/subscriptions/webhook` - confirmed by tailing the live server log (nothing new arrived) and by independently curling the ngrok URL directly (got a clean `401` back, proving the tunnel and route both work for a directly-sent request). Razorpay's own dashboard also still showed the subscription as `Created`, not `Active`.

**Leading theory at the time** (not confirmed): ngrok's free-tier browser-warning interstitial intercepting Razorpay's webhook POST before it reached the app - a known ngrok free-tier behavior. No webhook delivery log was found in Razorpay's dashboard to confirm it directly.

## 5. Manually triggered a webhook to unblock testing - against the WRONG account (twice)

To independently prove the webhook-handling code was correct and get the user unblocked, fired a correctly HMAC-signed `subscription.activated` event directly at `/subscriptions/webhook`. **Mistake**: the subscription id used belonged to `alex_wanders` - a seed test account used in my own automated Playwright scripts throughout Phases 1-5 - not the account the user was actually looking at in their own browser (`hardik.rastogi8118`). The badge appeared on the wrong profile.

Caught when the user shared a screenshot showing their own profile (`hardik.rastogi8118`) still unverified. Fixed by querying the database directly for that user's actual `Subscription` row and re-firing the signed webhook against the correct subscription id. This happened a **second time** shortly after for a different account (`drgroot`, the user's second real test account) - same fix, found via `ORDER BY createdAt DESC` on the `Subscription` table to identify whichever row was actually just created by the real checkout click, rather than assuming which account was being tested.

**Lesson**: when simulating something on behalf of a live user session, always confirm which account is actually authenticated in their browser rather than reusing an id from earlier automated testing.

## 6. Switched from ngrok to Cloudflare Tunnel

Rather than keep guessing at the ngrok interstitial theory, switched the local tunnel entirely: `cloudflared tunnel --url http://localhost:4000`, webhook URL updated in Razorpay's dashboard to the new `trycloudflare.com` address. Verified the new tunnel forwards correctly (`401` from our own app, same clean signal as before).

**This resolved the actual delivery problem**: two real `subscription.cancelled` events (fired when the user cancelled the two mis-flipped subscriptions from Razorpay's dashboard, cleaning up after issue #5) came through the new Cloudflare tunnel successfully and correctly updated the database - the first real, unassisted webhook deliveries of the whole session.

## 7. The remaining delay was never a bug - it was NACH settlement lag

After switching tunnels, a fresh real payment still didn't trigger a webhook right away, which looked like the same problem recurring. Distinguished the two possible causes by checking Razorpay's own dashboard status for that specific subscription: it also showed `Created`, matching the database exactly. Since Razorpay itself hadn't internally marked the subscription active, there was no event for it to send - not a delivery failure at all.

Root cause: EMandate/NACH is a bank-mediated, batch-cleared debit system - mandate *registration* (what "Payment Successful" reflects) and mandate *confirmation* are two separate steps with real settlement lag, even in sandbox. Razorpay's test environment appears to simulate this lifecycle faithfully rather than instant-activating NACH mandates the way it likely does for cards/UPI.

## 8. Manual sync as the practical, ongoing workaround

Wrote a reusable script (`fire_webhook_current.js`, kept in the local scratchpad, not part of the repo) that builds a `subscription.activated` payload, signs it with the real `RAZORPAY_WEBHOOK_SECRET` exactly as Razorpay would, and POSTs it to the real `/subscriptions/webhook` endpoint - exercising the actual signature-verification and database-update code, not a raw DB edit. Confirmed live: running it flipped `isVerified` to `true` and the badge appeared on the user's real profile immediately, with no caching or refresh needed.

## 9. Confirmed: card-based recurring is not enabled on this account at all

Checked Razorpay Dashboard → Settings → Payment Methods directly (rather than continuing to infer it from repeated card failures) - there is no option for card-based recurring/subscription payments there at all. This upgrades issue #3's "likely not enabled" theory to confirmed fact: no test card number, correct or not, was ever going to work. EMandate/NACH remains the only usable payment method on this account until Razorpay support enables it (not self-serve).

Identified but not yet tried, since NACH was accepted as the working-if-slow path forward instead:
- Checking the specific subscription's own detail page in Razorpay's dashboard for a "Retry"/"Resend" action button (only the list-level status was ever checked, not per-subscription actions).
- Trying a different bank for the EMandate flow (State Bank of India / ICICI instead of HDFC, which showed a "facing issues" warning earlier) in case settlement simulation differs by bank.
- Filing a support request with Razorpay to enable card-recurring on the test account, or to ask about expected NACH settlement timing in sandbox.

## 10. The manual-sync script's hardcoded subscription id goes stale on every resubscribe

`fire_webhook_current.js` hardcodes the subscription id it targets. Every time a fresh checkout happens (a new payment attempt, including after our Phase 5 resubscribe fix replacing a cancelled subscription's id), that hardcoded value goes stale, and running the script crashes with `TypeError: Cannot read properties of null (reading 'userId')` - because the webhook handler correctly no-ops for an unrecognized subscription id (by design, see Phase 3), leaving the script's own follow-up lookup with nothing to read. Not an app bug - the app's `200 { received: true }` response in that case is exactly correct behavior. The fix each time was re-querying the `Subscription` table for the current id and updating the script before re-running - done at least twice over the course of this session.

## Summary: what was actually a bug vs. what wasn't

| # | Issue | Real app bug? |
|---|---|---|
| 2 | `fail_existing: 0` not honored by Razorpay's real API | No - Razorpay API behavior differing from its own docs; worked around in our code |
| 3, 9 | UPI/card recurring unavailable, real card rejected | No - confirmed account configuration, not a Test Mode quirk or app issue |
| 4 | Webhook never arrived via ngrok | Likely no - probably ngrok's free-tier interstitial, external to our app |
| 5 | Manually activated the wrong account's badge | **Yes, but a testing-process mistake, not shipped code** - never affected any real user-facing behavior |
| 6-7 | Delay after switching to Cloudflare | No - confirmed as Razorpay's own NACH settlement timing, not delivery failure |
| 10 | Manual-sync script crashing on a stale subscription id | No - expected behavior of a scratchpad debugging tool, not app code |

The only genuine code bug across all of this was #2 (already fixed). Everything else was either Razorpay Test Mode's real behavior, account configuration outside our code, or friction in manual testing/debugging tooling - not defects in the shipped feature.

## Still open

Card-based recurring payments are not available on this Razorpay test account (confirmed, #9), so every test payment currently has to go through EMandate/NACH's slower settlement cycle. The three untried options above (check for a per-subscription retry action, try a different EMandate bank, or ask Razorpay support) remain the paths to a faster testing experience, if that becomes worth pursuing later.
