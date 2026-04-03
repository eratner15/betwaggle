# Waggle Drip Email Sequence

5-email nurture sequence triggered after email capture. All emails sent **from "Evan at Waggle" <evan@betwaggle.com>**.

## Sequence

| # | File | Day | Subject Line | Goal |
|---|------|-----|-------------|------|
| 1 | `drip-01-welcome.html` | 0 (immediate) | Your group is gonna love this | Introduce product + drive to demo |
| 2 | `drip-02-social-proof.html` | 2 | How a foursome used Waggle on their Scottsdale trip | Build trust via story |
| 3 | `drip-03-feature-spotlight.html` | 4 | Nassau, skins, wolf — and 9 more games your group doesn't know yet | Show breadth of value |
| 4 | `drip-04-urgency.html` | 7 | Your buddies' trip is coming up. Lock in $32. | Create urgency + CTA to purchase |
| 5 | `drip-05-last-chance.html` | 14 | Still using a spreadsheet? | Final direct ask + testimonial |

## Integration Notes for Backend (@Shank)

- These HTML templates use `{{email}}` as the placeholder for the recipient's email in unsubscribe links.
- Existing `lib/email.js` has a working `DRIP_SEQUENCE` array and `sendDripEmail()` function — update the copy and day offsets to match these templates.
- Sender should be changed from `tips@betwaggle.com` to `evan@betwaggle.com` in the Resend `from` field.
- Day offsets changed: was [0, 3, 7, 14, 21] → now [0, 2, 4, 7, 14] (tighter cadence, faster to conversion).

## Brand Notes

- Voice: Direct, benefit-first, conversational. Written as Evan talking to a friend.
- Pricing: Always "$32 per event" or "$32" — never mention old $199/$149 pricing.
- Always mention "under $8 per person" for foursome context.
- CTAs: "Set Up Your Event — $32" (primary) or "Try the Demo" (secondary).
