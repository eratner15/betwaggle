# Waggle Drip Email Sequence

5-email nurture sequence triggered after email capture. All emails sent **from "Evan at Waggle" <evan@betwaggle.com>**.

## Sequence

| # | File | Day | Subject Line | Goal |
|---|------|-----|-------------|------|
| 1 | `drip-01-welcome.html` | 0 (immediate) | Your group's gonna love this | Introduce product + drive to demo |
| 2 | `drip-02-social-proof.html` | 2 | How a 4-some used Waggle on their trip | Build trust via story |
| 3 | `drip-03-feature-spotlight.html` | 4 | Nassau, skins, and automated settlement (your group will feel this immediately) | Show feature value |
| 4 | `drip-04-urgency.html` | 7 | Your buddies trip is coming up. Lock in $32/event. | Create urgency + CTA to purchase |
| 5 | `drip-05-last-chance.html` | 14 | Last chance: set up your next event for $32/event | Final direct ask + testimonial |

## Integration Notes for Backend (@Shank)

- These HTML templates use `{{email}}` as the placeholder for the recipient's email in unsubscribe links.
- `worker.js` now contains the live `DRIP_SEQUENCE` and `sendDripEmail()` implementation.
- Sender for drip emails is `Evan at Waggle <evan@betwaggle.com>` via `getDripFromAddress()`.
- Active day offsets are `[0, 2, 4, 7, 14]`.

## Brand Notes

- Voice: Direct, benefit-first, conversational. Written as Evan talking to a friend.
- Pricing: Always "$32/event" or "$149/season pass" — never mention old pricing.
- Always mention "under $8 per person" for foursome context.
- CTAs: "Set Up Your Event — $32" (primary) or "Try the Demo" (secondary).
