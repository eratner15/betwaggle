# Waggle Scramble Season Outreach Sequence

**Owner:** Birdie (CMO)
**Target:** Golf course pros, tournament directors, charity scramble organizers
**Season:** May through October (peak scramble months)
**Goal:** 500 courses contacted → 50 affiliates activated → 150 events/year

## Outreach Cadence

| Step | File | Timing | Subject Line | Trigger |
|------|------|--------|-------------|---------|
| 1 | `scramble-pitch.html` | Week 1 | Your next scramble — live leaderboard, betting, and settlement in one link | Cold send to new course pros |
| 2 | `affiliate-invite.html` | Week 2 | Earn $8-$12 every time a group at {{course_name}} bets on golf | All who opened Email 1 |
| 3 | `follow-up.html` | Week 3 | {{X}} courses are already using Waggle this season | Opened Email 1 or 2, didn't convert |
| 4 | `scramble-season-newsletter.html` | Monthly (May-Oct) | {{month}} scramble season update — tips, what's new, and a quick win | All who opened or clicked any email |

## Segment Logic

- **New contacts:** Enter at Step 1
- **Opened but no click:** Get Step 2 (affiliate angle) + Step 3 (social proof follow-up)
- **Clicked but no conversion:** Get monthly newsletter only
- **Converted (created event or signed up as affiliate):** Move to customer/affiliate nurture (separate sequence)
- **Never opened:** Re-send Step 1 with alternate subject line after 14 days, then suppress

## Template Variables

All templates use these merge fields:

| Variable | Source | Example |
|----------|--------|---------|
| `{{first_name}}` | D1 `outreach_contacts.first_name` | Mike |
| `{{course_name}}` | D1 `outreach_contacts.course_name` | Pinehurst Resort |
| `{{email}}` | D1 `outreach_contacts.email` | mike@pinehurst.com |
| `{{active_courses}}` | D1 count query | 47 |
| `{{month}}` | Current month | June |
| `{{month_year}}` | Month + year | June 2026 |
| `{{month_slug}}` | Lowercase month | june |
| `{{events_this_month}}` | D1 events count | 84 |
| `{{courses_active}}` | D1 active courses count | 47 |
| `{{tip_title}}` | Content calendar | How to promote your scramble sportsbook to sponsors |
| `{{tip_body}}` | Content calendar | (paragraph of tactical advice) |
| `{{testimonial_quote}}` | Customer feedback | We ran our charity scramble on Waggle... |
| `{{testimonial_attribution}}` | Customer feedback | Tournament chair, Whistling Straits |
| `{{update_1}}, {{update_2}}, {{update_3}}` | Product updates | New: closest-to-pin auto-scoring |

## Key Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Emails sent | 500 initial, scale to 5,000 | Resend dashboard |
| Open rate | >30% | Resend webhook → D1 `outreach_events` |
| Click rate | >5% | Resend webhook → D1 `outreach_events` |
| Affiliate signups | 50 by Month 3 | D1 `affiliates` table |
| Events from affiliates | 150/year | D1 `events` with `affiliate_id` |

## Backend Requirements (@Shank)

1. **D1 table: `outreach_contacts`** — store course pro contact info, current step, last_sent_at, status (active/suppressed/converted)
2. **D1 table: `outreach_events`** — log opens, clicks, bounces, unsubscribes from Resend webhooks
3. **Worker.js cron** — daily check for contacts due for next touch based on step + timing rules above
4. **Resend integration** — send via Resend API with merge field replacement
5. **Segment routing** — check outreach_events to determine which contacts get which emails

## Content Calendar (Monthly Newsletter)

| Month | Tip Title | Theme |
|-------|-----------|-------|
| May | How to promote your scramble sportsbook to sponsors | Season kickoff |
| June | 3 side bets your scramble is missing | Engagement |
| July | Mid-season check: are your members using the settlement cards? | Adoption |
| August | How one club ran a 24-team member-guest on Waggle | Case study |
| September | End-of-season tournament ideas your members haven't tried | Expansion |
| October | Wrap up the season — your Waggle year in review | Retention |

## Pricing Reference

- **Scrambles/tournaments:** $149/event
- **Buddies trips:** $32/event
- **Affiliate payout:** $8 (Starter), $10 (Pro), $12 (Ambassador) per event referred
