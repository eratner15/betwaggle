# Waggle Paid Ads Strategy

**Owner:** Birdie (CMO)
**Total Monthly Budget (Phase 1):** $1,000/month
**Primary KPI:** Cost per Event Created (target: < $25)
**Secondary KPI:** Cost per Email Capture (target: < $3)

---

## Budget Allocation

| Channel | Monthly Budget | % of Total | Primary Objective |
|---------|---------------|------------|-------------------|
| Google Search | $500 | 50% | Capture high-intent searches |
| Meta (Facebook/Instagram) | $300 | 30% | Awareness + retargeting |
| Reddit | $200 | 20% | Community seeding + promoted posts |
| **Total** | **$1,000** | 100% | |

Scale to $2,500/mo when cost-per-event-created is consistently under $20.

---

## 1. Google Ads (Highest Intent)

### Search Campaigns

**Campaign A: Golf Trip / Buddies (Awareness)**
- Keywords: "golf trip app", "golf trip betting", "golf trip scoring app", "golf buddies trip planner"
- Match type: Phrase + Exact
- Expected CPC: $1.50-2.50
- Landing page: /demo/ (not homepage)
- CTA: "Try the Demo" → email capture → event creation
- Budget: $200/mo

**Campaign B: Game-Specific (High Intent)**
- Keywords: "nassau golf game app", "skins game calculator", "golf skins tracker", "nassau scoring app", "wolf golf game tracker"
- Match type: Exact
- Expected CPC: $1.00-2.00
- Landing page: Matching /games/{game}/ page → demo → create
- Budget: $150/mo

**Campaign C: Scramble/Tournament (Premium)**
- Keywords: "golf scramble scoring app", "member guest scoring app", "charity golf tournament app", "golf tournament leaderboard app"
- Match type: Phrase + Exact
- Expected CPC: $2.50-3.50
- Landing page: /demo-scramble/ → create event ($149)
- Budget: $150/mo

### Display / Retargeting
- Retarget: site visitors who viewed /demo/ or /create/ but didn't convert
- Frequency cap: 3 impressions/day
- Creative: Settlement card screenshot + "Finish setting up your event"
- Budget: Included in Search budget (use remaining daily budget)

### Technical Setup
- `WAGGLE_GADS_ID` and `WAGGLE_GADS_LABEL` secrets exist — need real Google Ads account IDs from Evan
- Conversion events to track: `event_created` ($32 value), `email_captured` ($3 value), `demo_viewed` ($1 value)
- Attribution window: 30-day click, 7-day view

---

## 2. Meta (Facebook + Instagram)

### Audience Targeting

**Audience 1: Trip Organizer**
- Age: 28-55, Male
- Interests: Golf, Golf Digest, Myrtle Beach Golf, Scottsdale Golf, Golf Travel
- Behaviors: Frequent travelers, group event planners
- Lookalike: Based on email list of event creators (once 100+ in list)

**Audience 2: Scramble / Charity**
- Age: 35-65, Male + Female
- Interests: Golf, Charity events, Country clubs, Golf tournaments
- Job titles: Event coordinator, Golf professional, Tournament director
- Placement: Facebook Feed + Instagram Feed (no Stories for this audience)

**Audience 3: Retargeting**
- Custom audience: Site visitors (30 days) who didn't create an event
- Exclude: People who already created an event (via pixel event)

### Creative Briefs

**Static Ad 1: Settlement Card**
- Visual: Screenshot of Waggle settlement card showing who owes what
- Headline: "No more arguing over math at the 19th hole"
- Description: "$32 for the whole trip. Live odds. Automatic settlement."
- CTA button: "Try Demo"

**Static Ad 2: Before/After**
- Visual: Split screen — crumpled paper scorecard vs. clean Waggle dashboard on phone
- Headline: "Your golf trip deserves better than a spreadsheet"
- Description: "Live scoring on every phone. No app download."
- CTA button: "Learn More" → /demo/

**Static Ad 3: Price Anchor**
- Visual: $32 large text with gold/green brand colors, golf background
- Headline: "$32. Under $8 per person. No app."
- Description: "Set up your golf trip sportsbook in 5 minutes."
- CTA button: "Get Started" → /create/

**Video Concept 1: "The Group Chat" (15s Reel)**
- Scene: Phone screen showing chaotic group chat about who owes what
- Cut to: Waggle settlement card — clean, automatic, done
- Text overlay: "Stop doing math. Start using Waggle."
- CTA: Link in bio → /demo/

**Video Concept 2: "Live Odds" (15s Reel)**
- Scene: Golf course, someone makes a putt
- Cut to: Phone showing odds updating in real time
- Text overlay: "Live odds. Every hole. Every phone."
- CTA: Link to /demo/

**Video Concept 3: "5 Minutes" (30s)**
- Walkthrough: Screen recording of creating an event in under 5 minutes
- Voiceover: Evan explaining how simple it is
- End card: "Set Up Your Event — $32"
- CTA: Link to /create/

### Meta Pixel Setup
- Pixel placeholder exists in codebase — needs real Meta Pixel ID from Evan
- Events to track: PageView, ViewContent (demo), Lead (email capture), Purchase (event created)

---

## 3. Reddit (Community-First)

### Organic Strategy (Week 1-4, $0)

**Target Subreddits:**
- r/golf (1.4M members) — primary
- r/GolfSwing, r/GolfGTI — secondary
- r/golfclassifieds — cross-post when relevant

**Post Templates:**

Post 1 — Launch Announcement:
> Title: "I built a sportsbook for your guys trip — free for casual rounds, $32 for the full betting experience"
> Body: Personal story about building Waggle, what it does, link to demo. Ask for feedback.

Post 2 — Social Proof:
> Title: "We ran our member-guest on Waggle last weekend — here's the settlement card"
> Body: Screenshot of settlement, story of how it went, invitation to try.

Post 3 — Game Education (SEO crossover):
> Title: "The complete guide to running a Nassau with automatic pressing"
> Body: Short rules overview, link to /games/nassau/ for full guide + demo.

**Rules:**
- Always disclose: "I built this" or "Founder here"
- Lead with value (rules, tips), not product pitch
- Respond to every comment
- Never post more than 1x/week to r/golf
- Monitor mentions of "golf trip", "scoring", "betting" for organic engagement

### Paid Reddit Ads (Month 2+)

- Format: Promoted Posts (look native)
- Targeting: r/golf, interests: golf, ages 25-55
- Creative: Settlement card screenshot + "No more spreadsheet drama"
- Budget: $200/mo
- CPC expectation: $0.50-1.50 (Reddit is cheaper than Meta for niche)
- Landing: /demo/

---

## 4. Channels to Evaluate (Phase 2+)

| Channel | Estimated Cost | When to Test | Why |
|---------|---------------|-------------|-----|
| GolfWRX forum sponsorship | $500-1,500/mo | Month 3 | Hardcore golf community, high intent |
| No Laying Up podcast | $2,000-5,000/episode | Month 4 | Perfect demo overlap with trip organizers |
| Fore Play (Barstool) podcast | $3,000-8,000/episode | Month 4 | Large casual golf audience |
| Golf Digest display | $5,000+/mo | Month 6+ | Scale play, only after unit economics proven |
| Golf YouTube mid-rolls | $500-2,000/video | Month 3 | Good Good Golf, Bob Does Sports, etc. |

### Evaluation Criteria for Phase 2
- Only expand if Phase 1 achieves < $25 cost-per-event-created
- Test one new channel per month
- Minimum 30-day test before evaluating
- Kill any channel with > $40 cost-per-event after 30 days

---

## 5. KPIs and Reporting

### Weekly Dashboard

| Metric | Google | Meta | Reddit | Total |
|--------|--------|------|--------|-------|
| Spend | - | - | - | - |
| Impressions | - | - | - | - |
| Clicks | - | - | - | - |
| CTR | - | - | - | - |
| Demo views | - | - | - | - |
| Email captures | - | - | - | - |
| Events created | - | - | - | - |
| Cost/event | - | - | - | - |
| Revenue | - | - | - | - |
| ROAS | - | - | - | - |

### Targets (Month 1)

| Metric | Target |
|--------|--------|
| Total events from paid | 15-25 |
| Cost per event created | < $25 |
| Cost per email capture | < $3 |
| ROAS (events at $32) | > 1.2x |
| Email captures | 100+ |

### Scaling Rules
- If ROAS > 2x for 2 consecutive weeks → increase that channel budget 50%
- If ROAS < 0.8x for 2 consecutive weeks → pause and review creative
- If cost-per-event > $40 for 3 weeks → kill that campaign
- Monthly budget review with Caddie

---

## 6. Open Items

- **Google Ads account:** Need real WAGGLE_GADS_ID and WAGGLE_GADS_LABEL from Evan
- **Meta Pixel:** Placeholder exists, need real Pixel ID from Evan
- **Creative production:** See [BET-69](/BET/issues/BET-69) for ad creative assets
- **Retargeting audiences:** Need minimum 100 site visitors before retargeting campaigns go live
- **Reddit account:** Need a non-brand Reddit account for organic posting (brand accounts get flagged)
