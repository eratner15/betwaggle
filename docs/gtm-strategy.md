# Waggle GTM Strategy — CMO Playbook

**Owner:** Birdie (CMO)
**Goal:** $50K MRR = ~1,563 paid events/month at $32/event
**Document Version:** v1.0 — April 2026
**Status:** Active

---

## 1. ICP Segments (Priority Order)

### Segment A: Charity Scramble Organizers (Highest Volume)
- **Price point:** $149/event
- **Profile:** Nonprofit event coordinators, golf committee chairs, corporate outing planners
- **Pain:** Spreadsheet scoring, manual leaderboards, volunteer-dependent processes
- **Volume:** Tens of thousands of charity golf events annually in the US
- **Why they pay:** One product replaces scoring, betting, and settlement. Looks professional to sponsors.
- **Conversion path:** Course pro referral or Google search → demo scramble → create event

### Segment B: Guys Trip Planners (Viral, Word-of-Mouth)
- **Price point:** $32/event ($8/person for a foursome)
- **Profile:** Mike, 28-45, organizes the annual Myrtle/Scottsdale trip. Manages the group chat. Hates chasing Venmo.
- **Pain:** Manual Nassau tracking, disputed math at the 19th hole, no one wants to be the spreadsheet person
- **Volume:** Millions of recreational golf trips annually
- **Why they pay:** $32 to never argue over math again. Looks like a hero to the group.
- **Conversion path:** Homepage or Reddit/social → demo buddies → create $32 event
- **Viral loop:** Settlement card sharing → friends see Waggle → create their own event

### Segment C: Member-Guest Tournament Directors (Premium)
- **Price point:** $149/event
- **Profile:** Susan, golf committee volunteer at a 400-member private club. Currently uses Golf Genius ($500+/yr) or spreadsheets.
- **Pain:** Golf Genius is expensive and only she knows how to use it. Betting layer is entirely manual.
- **Volume:** Every private and semi-private club runs 2-8 organized events/year
- **Why they pay:** $149 for a product that handles scoring, betting, and settlement in one place. Saves $350+/yr vs Golf Genius.
- **Conversion path:** Club pro referral or direct outreach → demo scramble → first event free → upgrade to paid

### Segment D: Weekly League Commissioners (Recurring)
- **Price point:** $9.99/month Season Pass (pending pricing clarification — see BET-59)
- **Profile:** Runs a weekly skins game or Saturday group. 8-16 regulars.
- **Pain:** Same manual tracking every week. Wants something permanent, not one-off.
- **Volume:** Smaller segment but highest LTV per customer (recurring monthly)
- **Conversion path:** Word of mouth from Trip Organizer segment → Season Pass subscription

### Segment E: Course Pros as Affiliates (Distribution Channel)
- **Payout:** $8-$12/event referred (tiered: Starter $8, Pro $10, Ambassador $12)
- **Profile:** PGA club professional or golf director. Controls member communications. Trusted recommender.
- **Why they participate:** Passive income, "Powered by [Club Name]" branding, makes their events better
- **Target:** 500 outreach → 50 activated → 150 events/year = $22K ARR from this channel alone
- **Conversion path:** Cold email → affiliate signup at /affiliates/ → share link with members

---

## 2. Channel Mix (Ranked by ROI and Time-to-Impact)

### Tier 1 — High Priority (Launch immediately)

**1. Organic Social: Reddit, Facebook Groups, Twitter/X**
- r/golf (4M+ members), golf trip Facebook groups, golf Twitter
- Authentic stories, not ads. "Here's how we ran our trip with Waggle."
- Settlement card screenshots as social proof
- Cost: $0. Time: immediate. Expected: 5-15 events/month organic

**2. Club Pro Direct Outreach (Email)**
- Build list of 500 club pros from NGCOA + PGA directories
- Personal cold email (not newsletter blast) → follow-up with demo → affiliate onboarding
- First event free offer → $8-12/referral ongoing
- Cost: time only. Expected: 50 activated pros by Day 90

**3. SEO Content Hub (/games/ pages)**
- Already built: 11 game guide pages with FAQ, HowTo, Article schema
- Target keywords: "nassau golf betting rules", "skins game scoring", "wolf golf game"
- Each page drives to /create/ with "Set Up Your Event — $32" CTA
- Cost: already invested. Expected: growing organic traffic Month 2+

### Tier 2 — Medium Priority (Weeks 3-6)

**4. Paid Social: Facebook + Instagram**
- Audience: Golfers 28-60, HHI $75K+, interests in golf + travel
- Budget: $500-1,000/month test
- Creative: video testimonials, phone mockups showing live odds mid-round
- Optimize toward event creation, not click-throughs
- Expected CPA: $15-25/event creation

**5. Google Search Ads**
- High-intent keywords: "golf trip app", "skins game calculator", "member guest scoring app"
- Budget: $300-500/month
- Expected CPC: $1.50-3.50
- Landing page: /demo/ (not homepage)
- Expected CPA: $10-20/event creation

**6. Golf YouTube Creators**
- Target: Good Good Golf, Bob Does Sports, smaller channels (50K-500K subs)
- Offer: gifted events + affiliate commission
- 2-3 partnerships in first 90 days
- Expected: 20-100 event creations per creator mention

### Tier 3 — Longer Lead (Month 2-3+)

**7. Golf Travel Companies (B2B Affiliate)**
- Golfbreaks, Golf Vacation Insider, etc.
- Revenue share: 15-20% of event fee as bundle upsell
- 60-90 day relationship-building cycle
- High volume once live

**8. Affiliate Referrals (General)**
- /affiliates/ signup page live with tiered payouts
- Content creators, trip organizers, anyone with a golf audience
- Expected: 150 affiliates by Month 3

---

## 3. Conversion Funnel

### Trip Organizer Path
```
Social/Search → Homepage → Demo Buddies → Create $32 Event → Settlement Card Shared → Friends Create Events
```

### Course Pro / Club Director Path
```
Cold Email → /affiliates/ Landing → Demo Scramble → Create Free Event → Upgrade to Paid ($149) → Refer Members
```

### Organic / SEO Path
```
Google "nassau golf rules" → /games/nassau/ → Try Demo → Email Capture → Drip Sequence → Create Event
```

### Email Nurture (Post-Capture)
5-email drip sequence over 14 days:
1. **Day 0:** Welcome — "Your group's gonna love this" + demo link
2. **Day 2:** Social proof — 4-some trip story
3. **Day 4:** Feature spotlight — Nassau, skins, auto-settlement
4. **Day 7:** Urgency — "Your buddies' trip is coming up. Lock in $32."
5. **Day 14:** Last chance — direct ask + testimonial

**Note:** HTML templates ready in /emails/. Worker.js needs update (BET-57).

---

## 4. 90-Day Targets

| Metric | Month 1 | Month 2 | Month 3 |
|--------|---------|---------|---------|
| Paid events created | 10 | 30 | 100 |
| Revenue | $320-$1,490 | $960-$4,470 | $3,200-$14,900 |
| Affiliate signups | 50 | 150 | 500 |
| Active affiliate referrers | 10 | 30 | 50 |
| Email list size | 200 | 500 | 1,500 |
| Club pros activated | 15 | 35 | 50 |
| Organic site visits/month | 2,000 | 5,000 | 10,000 |

### Revenue Range Explanation
- Low end: all events at $32 (buddies trips only)
- High end: 30% events at $149 (scrambles/member-guest)
- Month 3 high end of $14,900 gets us ~30% of the way to $50K MRR target

### Path to $50K MRR
$50K MRR requires ~1,563 events/month at $32 average or ~335 events/month at $149 average. Realistic blended scenario:
- 800 buddies trips × $32 = $25,600
- 165 scrambles/tournaments × $149 = $24,585
- Total: ~$50,185 MRR
- Timeline: 9-12 months from launch with compounding viral + affiliate growth

---

## 5. Key Messaging

**Core:** "Turn your golf event into a real sportsbook. In five minutes."

**Trip Organizer:** "$32 for the whole trip — less than a sleeve of Pro V1s. No more chasing Venmo. No more spreadsheet disputes."

**Club Director:** "Your members expect more than a leaderboard. Give them live odds, match betting, and settlement that works itself out. $149 per event."

**Club Pro Affiliate:** "Recommend Waggle to your members and earn $8-12 every time someone runs an event. Set it up once — earn on every tournament."

**CTA Standard:**
- Primary: "Set Up Your Event — $32"
- Secondary: "Try the Demo"

---

## 6. Objection Handling

| Objection | Response |
|-----------|----------|
| "Too complicated for a casual trip" | Organizer sets it up — everyone else just taps a link. No accounts, no downloads. 90-second demo. |
| "$32 seems steep" | Split 8 ways = $4/person. Less than a round of beers at the turn. |
| "We already use Golf Genius" | Golf Genius scores. Waggle bets. Live odds, match wagering, auto-settlement. Also $350/yr cheaper. |
| "Is this legal?" | Same as your existing Nassau — we just automate the math. Not a licensed sportsbook. |

---

## 7. Open Items

- **BET-57:** Worker.js drip sequence needs sync with /emails/ templates (assigned to Shank)
- **BET-58:** Internal pages (/marketing, /gtm, /ads) need auth protection (assigned to Shank)
- **BET-59:** Season Pass pricing needs clarification — is $149 per-event or per-season? (assigned to Caddie)
- **BET-60:** QA verification of pricing + CTA changes (assigned to Spotter)
- **BET-67:** Consolidate /affiliate/ and /affiliates/ URL paths (assigned to Shank)
