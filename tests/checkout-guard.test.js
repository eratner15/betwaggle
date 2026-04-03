// Checkout guard regression tests (BET-218)
// Run: node tests/checkout-guard.test.js

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) {
    passed += 1;
    process.stdout.write('.');
    return;
  }
  failed += 1;
  console.error(`\n  FAIL: ${msg}`);
}

async function runSimpleCheckoutGuard({
  tier,
  email,
  eventSlug,
  getCheckoutEventStatus,
  createStripeSession,
}) {
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { status: 400, body: { error: 'Valid email required' } };
  }
  if (tier !== 'event' && tier !== 'season') {
    return { status: 400, body: { error: 'tier must be "event" or "season"' } };
  }
  if (tier === 'event') {
    if (!eventSlug || !/^[a-z0-9_-]{2,64}$/.test(eventSlug)) {
      return { status: 400, body: { error: 'Invalid eventSlug format' } };
    }
    const status = await getCheckoutEventStatus(eventSlug);
    if (!status.exists || !status.kvExists || !status.kvValid || !status.kvActive) {
      return { status: 404, body: { error: 'Event not found' } };
    }
  }
  const session = await createStripeSession();
  return { status: 200, body: session };
}

async function main() {
  console.log('Checkout Guard Regression Tests (BET-218)\n');

  // Invalid event slug must return 404 with stable payload and never call Stripe.
  let stripeCalls = 0;
  const invalidResult = await runSimpleCheckoutGuard({
    tier: 'event',
    email: 'qa@example.com',
    eventSlug: 'does-not-exist',
    getCheckoutEventStatus: async () => ({ exists: false, kvExists: false, kvValid: false, kvActive: false }),
    createStripeSession: async () => {
      stripeCalls += 1;
      return { ok: true, checkoutUrl: 'https://stripe.invalid/test', sessionId: 'cs_test_invalid' };
    },
  });
  assert(invalidResult.status === 404, 'Invalid event slug should return 404');
  assert(invalidResult.body?.error === 'Event not found', 'Invalid event slug should return stable error payload');
  assert(stripeCalls === 0, 'Invalid event slug should not create Stripe session');

  // Valid event slug still creates checkout.
  stripeCalls = 0;
  const validResult = await runSimpleCheckoutGuard({
    tier: 'event',
    email: 'qa@example.com',
    eventSlug: 'masters-trip',
    getCheckoutEventStatus: async () => ({ exists: true, kvExists: true, kvValid: true, kvActive: true }),
    createStripeSession: async () => {
      stripeCalls += 1;
      return { ok: true, checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_test_valid', sessionId: 'cs_test_valid' };
    },
  });
  assert(validResult.status === 200, 'Valid event slug should return 200');
  assert(typeof validResult.body?.checkoutUrl === 'string' && validResult.body.checkoutUrl.includes('stripe.com'), 'Valid event slug should include checkoutUrl');
  assert(typeof validResult.body?.sessionId === 'string' && validResult.body.sessionId.length > 0, 'Valid event slug should include sessionId');
  assert(stripeCalls === 1, 'Valid event slug should create exactly one Stripe session');

  console.log(`\n\nPassed: ${passed}`);
  console.log(`Failed: ${failed}`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('\n  FAIL: test runner crashed', err?.message || err);
  process.exit(1);
});
