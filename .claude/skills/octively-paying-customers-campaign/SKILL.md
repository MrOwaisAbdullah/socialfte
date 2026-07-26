---
name: octively-paying-customers-campaign
description: Load when the task is getting Octively its first paying customers or growing MRR — signup/activation/conversion is flat, "how do we get more customers", "what should I work on for growth", "is the validation sprint done", "should I build X to get customers", "run the GTM plan", or any request touching docs/Octively MVP Go-to-Market.md, docs/12_methods_to_get_saas_clients.md, docs/outreach-guide.md, docs/octively-validation-and-distribution-plan.md, the affiliate program, or the free tools funnel. This is the executable, decision-gated campaign for Octively's owner-confirmed hardest live problem (2026-07-06): converting to PAYING customers. It measures the funnel first, branches to the right track (activation / acquisition / monetization), then hands out a ranked, evidence-gated solution menu — it does not let you guess which failure mode is live or build features to dodge the distribution problem.
---

# Octively — Paying Customers Campaign

Zero project lore assumed. Quote the path everywhere:

```bash
cd "/mnt/d/GIAIC/Real World Projects/Owflex Chatbot Saas"
```

**The one rule that governs this whole skill:** measure before you branch, predict a number
before you run an experiment, and never answer "no customers yet" by shipping more features.
North star (owner-confirmed 2026-07-06): **"cheapest reliable AI option, Pakistan-first."**
GTM north-star metric (`docs/Octively MVP Go-to-Market.md` line 9, dated 2026-06-16):
**3 freelancers paying within 30 days of starting outreach.**

## Source corpus (read, don't reinvent)

Every step below is distilled from these docs. Re-read the source before quoting it verbatim to
the owner — dates matter, these are living documents that drift:

| Doc | Dated | What it's for |
|---|---|---|
| `docs/Octively MVP Go-to-Market.md` | 2026-06-16 | The living GTM playbook — phases, timeline, tool stack, LLM cost strategy |
| `docs/octively-validation-and-distribution-plan.md` | 2026-06-07 | Critic-corrected strategy: validation-before-launch, 4 distribution engines, failure-mode defenses |
| `docs/outreach-guide.md` | undated (post-2026-06-07) | Exact scripts: where to find freelancers, the 4 validation questions, demo-to-paid language |
| `docs/12_methods_to_get_saas_clients.md` | live tracker, updated through 2026-07 | 12 zero-budget acquisition methods + a **live outreach results tracker** (16 contacted, 43.75% reply rate as of the last update) |
| `docs/octively-usp-competitive-analysis.md` | June 2026 | Positioning ammunition vs Stammer/ChatLab/ConvoCore/Chatbase — internal use only |
| `docs/free-tools-seo-research.md` | 2026-06-09 | Free-tools-funnel keyword research and batch plan |
| `docs/feature-difficulty-ranking.md` | 2026-06-16 (**partly stale — see §5**) | Effort-ranked backlog + "build now" recommendation |
| `docs/owflex_master_plan_v7.md` | living doc | SEO strategy section (Phase 3 of the GTM doc supersedes its sequencing) |

## When NOT to use this skill

- Diagnostic query mechanics, drizzle studio, log inspection, general instrumentation → `octively-diagnostics-and-tooling`.
- Cost-per-conversation, plan margin math, worked unit-economics examples → `octively-unit-economics-toolkit`.
- Deciding whether a proposed experiment counts as evidence, the idea-to-ADR lifecycle → `octively-research-methodology`.
- Whether a change is Doc/UI/Behavior/Money-path/Schema class and what gates it needs → `octively-change-control`.
- Writing the actual copy (no em dashes, Rs/PKR not the glyph) → `octively-docs-and-copy`.
- "What should Octively build next to win technically" (frontier R&D, not GTM) → `octively-research-frontier`.

---

## Phase 0 — Establish Ground Truth (do this every time, first)

Do not assume which failure mode is live. Measure. Two admin pages already compute the exact
funnel numbers you need — check these BEFORE writing a single new query.

### Step 0.1 — Read the existing platform-stats instrument

`lib/db/queries/admin.ts:69` (`getPlatformStats()`) is rendered at:
- `admin.octively.com/dashboard/admin/analytics`
- `admin.octively.com/dashboard/admin/metrics`

It already returns, in one call (verified against the function body, 2026-07-06):

| Field | What it tells you |
|---|---|
| `totalDevelopers` / `newSignupsThisMonth` | Signup volume — acquisition signal |
| `activatedDevelopers` / `activationRatePct` | Devs who created ≥1 bot (`INNER JOIN bots`) — activation signal |
| `totalBots` / `activeBots` | Bots created vs. currently `is_active` |
| `totalMessages` / `totalLeads` | This-month org counters (`conversations_this_month`, `leads_this_month`) |
| `planBreakdown` / `paidDevelopers` / `freeToPaidRatePct` | Real plan distribution — **this is your paying-customer count** |
| `estimatedMrrPkr` | `SUM(PKR_PRICES[plan] * count)` across paid orgs |
| `creditRevenueUsd` | `SUM(credit_transactions.delta) WHERE reason = 'purchase'` — real money that hit a webhook |
| `llmCostUsd` / `grossMarginPct` | AI cost vs. revenue — feed to `octively-unit-economics-toolkit`, not this skill |
| `shortLinkClicksTotal` | UTM'd short-link clicks (`short_links.click_count`) |

### Step 0.2 — Read the affiliate-stats instrument (newest asset, check it too)

`lib/db/queries/affiliates.ts:352` (`getAffiliateStats()`), rendered in the admin affiliate section.
Returns `totalAffiliates`, `activeAffiliates`, `totalReferrals`, `monthlyReferrals`,
`totalEarnedAll`/`totalPaidAll`, top 5 affiliates by earnings. The affiliate system
(`app/affiliate`, `affiliates.octively.com`) is fully built — data layer, billing-webhook
referral recording in both `app/api/webhooks/payfast/route.ts` and
`app/api/webhooks/lemon-squeezy/route.ts`, admin dashboard, self-service signup/approval
(commits `0116d02` through `2d0a16f`) — but **it does not appear in `ChangelogPage.tsx` or
`RoadmapPage.tsx`'s SHIPPED list** as of 2026-07-06. Treat it as a live, unpromoted asset:
check `getAffiliateStats().totalReferrals` — if it's 0, the program has zero distribution push
behind it yet (a Track-A/Engine-C gap, not a code gap).

### Step 0.3 — What the two instruments do NOT tell you (derive these yourself)

**Real third-party embeds (as opposed to bots merely created).** A bot existing is not a bot
live on a client's site. Every real chat POSTs `pageUrl` (`app/api/v1/chat/route.ts:117,267` →
`conversations.pageUrl`). Dashboard preview/embed-test traffic is also allowed through the origin
check (`app/api/v1/chat/route.ts:222-238`) and will show up with an `octively.com`/
`admin.octively.com` pageUrl. Filter those out:

```sql
-- Conversations whose pageUrl is a real third-party origin (not our own preview/test surface)
SELECT b.id AS bot_id, b.name, c.page_url, MIN(c.started_at) AS first_seen
FROM conversations c
JOIN bots b ON b.id = c.bot_id
WHERE c.page_url IS NOT NULL
  AND c.page_url !~ 'octively\.com'
  AND c.page_url !~ 'localhost'
GROUP BY b.id, b.name, c.page_url
ORDER BY first_seen ASC;
```

Run via `npm run db:studio` (drizzle-kit studio, reads `.env.local` per `drizzle.config.ts`) or a
one-off read-only script. This is a read query — no migration, no write. If you hit the WSL
Neon "fetch failed" issue, see `octively-build-and-env`.

**GA4 funnel events.** Confirmed wired (per GTM doc §Phase 0 checklist and
`NEXT_PUBLIC_GA_MEASUREMENT_ID=G-HZ03QGNY37` in `.env.example` / `app/layout.tsx`):
`signup_complete`, `bot_created`, `client_invited`, `plan_upgraded`, all UTM-tagged. Pull these
from the GA4 property (Realtime + last-30-days) for traffic-by-channel — this is the acquisition
signal the DB cannot give you (anonymous visitors never touch Postgres).

**Validation-sprint progress.** Not in any database — it's a manual tracking sheet
(`docs/outreach-guide.md` §Part 6 columns: Name/Platform/Date/Q1-Q4/Demo?/Paid?) plus the live
tracker embedded in `docs/12_methods_to_get_saas_clients.md` ("Our Results So Far"). Read the
current counts there before assuming zero outreach has happened — as of that doc's last update:
16 contacted, 7 replied (43.75%), 2 "hot", 3 "warm", 1 rejected, 0 converted to paid yet.

### Step 0.4 — The branch (EXPECTED-OBSERVATION gates)

Run Steps 0.1–0.3, then branch. Do not run two tracks in parallel — pick the one the numbers
point to, execute its gate criteria, re-measure, and only then reconsider.

| Observation | Branch to | Section |
|---|---|---|
| `totalDevelopers` > 0 but `activatedDevelopers` ≈ 0 (signups, no bot created) | **Track A — Activation** | §2 |
| `activatedDevelopers` > 0 but the third-party-embed query (§0.3) returns 0 rows (bots created, never installed on a real site) | **Track A — Activation**, focus on install friction | §2 |
| GA4 visitor count near zero / no UTM traffic in weeks | **Track B — Acquisition** | §3 |
| Real third-party embeds exist (§0.3 returns rows), conversations/leads are flowing, but `paidDevelopers` stays 0 or `freeToPaidRatePct` is flat | **Track C — Monetization** | §4 |
| Validation sprint tracker (§0.3) shows fewer than ~15 real conversations logged | Nothing else matters yet — **go do the validation sprint** (§1) before branching | §1 |

If more than one condition fires, fix the earliest-funnel-stage one first (activation blocks
everything downstream of it).

---

## The "you have a result when" ladder

Tie every claim of progress to DB evidence, not vibes. Do not skip a rung.

| # | Rung | DB evidence that proves it |
|---|---|---|
| 1 | First stranger signup (not you, not a friend you onboarded manually) | `users` row with `role='developer'`, cross-check against your own known contacts / the validation-sprint sheet |
| 2 | First live third-party embed | A row from the §0.3 query with a real external `page_url` |
| 3 | First Rs/USD payment webhook with valid signature | `credit_transactions` row with `reason IN ('purchase','plan_upgrade')` AND a matching successful `verifyItn`/HMAC log line in `app/api/webhooks/payfast/route.ts` or `lemon-squeezy/route.ts` — do not count a row that bypassed signature verification |
| 4 | First 3 paying customers (GTM north star) | `SELECT COUNT(DISTINCT org_id) FROM credit_transactions WHERE reason IN ('purchase','plan_upgrade')` ≥ 3, OR `organizations.plan != 'free'` for 3 distinct orgs |
| 5 | First month-2 retained payer | Same org still `plan != 'free'` (or still purchasing credit packs) in the calendar month AFTER their first paid transaction — proves retention, not just a one-time top-up |
| 6 | 10 paying customers (the WhatsApp-channel and Phase-7 feature gate) | Same query as rung 4, threshold 10. **This is the literal unlock condition for `specs/006-whatsapp-channel/spec.md` line 5: "Status: Planned (build only after ~10 paying customers)."** Do not start that spec before this rung. |

---

## Phase 1 — The 30-Day Validation Sprint (do this before any track, if §0.4 said to)

Full script: `docs/outreach-guide.md`. Full targets: `docs/octively-validation-and-distribution-plan.md` §4.

**Exact steps:**
1. Find 20 qualifying freelancers/agencies (Pakistan-based, ≥3 active clients, doing web/SEO/marketing/social work — `docs/outreach-guide.md` §Part 2). Sources ranked: Facebook groups (Pakistan Freelancers Network, Digital Marketing Pakistan, WordPress Pakistan, Upwork Pakistan, AI & Automation Pakistan) → LinkedIn search filters → Upwork/Fiverr active-seller search → warm WhatsApp intros.
2. Ask exactly these 4 questions, in this order (verbatim, `docs/outreach-guide.md` §Part 3):
   1. Do you currently offer AI chatbots to clients, or has a client asked?
   2. Do you stay involved after project delivery (support/updates calls)?
   3. How do you answer "how many leads did we get" today?
   4. Would you pay Rs 2,500/month for a tool giving each client their own branded portal?
3. Log every conversation in the tracking sheet (`docs/outreach-guide.md` §Part 6 columns) — this
   sheet, not a database table, is the source of truth for validation-sprint progress.
4. Convert interested responses to a live demo on `admin.octively.com` (bot creation) →
   `app.octively.com` (client portal) — this is "usually the moment that lands" per the guide.
5. Move demo → paid using the exact close language in `docs/outreach-guide.md` §Part 5 (lead
   with the Starter plan, reframe price against the client's own retainer value, offer a setup
   walkthrough if they hesitate).

**Predict the number before you run it** (per `octively-research-methodology`): write down your
expected reply rate and paid-conversion rate BEFORE contacting the next batch, so a result can
actually surprise you.

**Gate criteria to proceed to amplification (Product Hunt, SEO as acquisition):**

| Signal | Verdict |
|---|---|
| ≥5 of 20 say "I'd use this today" | ✅ Go — proceed to Track B/C amplification tactics |
| Most say "my clients don't ask for chatbots" | 🛑 Re-examine the market assumption, not the software (per the critic's verdict, `docs/octively-validation-and-distribution-plan.md` §1) |
| Most say "interesting but later" | Messaging/timing problem — vary the opener, do not add features |

**Do not launch Product Hunt before 5 active real users.** Do not treat SEO as an acquisition
channel yet — it is a 6-12 month compounding bet (both docs agree, independently).

---

## Track A — Activation (signups exist, bots/embeds don't)

Symptom from §0.4: developers sign up but never create a bot, or create one and never embed it live.

1. **Measure the drop-off point exactly.** `activationRatePct` from §0.1 tells you signup→bot-created.
   For bot-created→live-embed, re-run the §0.3 query per developer, not just aggregate.
2. **Self-serve onboarding wizard + video walkthrough** — status per
   `docs/octively-validation-and-distribution-plan.md` §9: PARTIAL (onboarding banner + step
   tracker exist; full wizard/video still open). This is Failure-mode defense #9
   ("founder becomes support team") — closing this gap is Behavior-class (full SDD pipeline,
   `octively-change-control`), not a quick patch.
3. **Founder DMs to every new signup** (`docs/octively-validation-and-distribution-plan.md`
   Engine B): "Saw you signed up. Curious what kind of clients you work with." Manual, not
   automated, until 50+ customers. This doubles as validation-sprint data collection.
4. **Demo video** as the activation nudge — GTM doc §"Demo Video" 60-second script (record with
   ScreenPal free tier); check current status in the GTM doc's Launch Status table before
   re-recording (it may already exist — verify, do not assume stale).

**Gate to move on:** `activatedDevelopers` trending up AND the §0.3 third-party-embed query
returns new rows week over week. If it plateaus, the blocker is UX friction, not distribution —
that's a product-usability bug, escalate to normal Behavior-class work, not this skill.

---

## Track B — Acquisition (traffic near zero)

Symptom from §0.4: GA4 shows near-zero visitors/UTM traffic; no track record of outreach.

Time-split while this track is active (both source docs agree, independently derived): **35%
talking to agencies/freelancers, 25% content, 20% demos/onboarding, 15% partnerships, 5% new
features.** If your actual time split inverts this, that is the finding — not a coincidence.

### Engine A — Build-in-public (LinkedIn + X), start immediately
2-3 posts/week, three pillars (building Octively / AI-freelancer economy / Claude Code
development). Workflow: `/social-media-writer` → `/humanizer-main` → Buffer free tier (3
channels, 10 posts/channel). Never skip the humanizer pass — Pakistani freelancers recognize
AI-sounding copy and it costs credibility (GTM doc "What NOT to Do" #6).

### Engine B — PK communities + founder DMs, start immediately
Facebook groups + WhatsApp, story-first ("A client asked if an AI chatbot could capture leads...
here's what happened"), never "Try Octively." **Ban guard: max 1 post per group per week.** This
engine IS the validation sprint (Phase 1) — they are the same activity, not two.

### Engine C — Partnerships + productized funnel, start once Engine A/B have traction
Recruit ~20 web designers/SEO consultants/social-media managers on 20% recurring commission
(**the affiliate system in §0.2 is the exact infrastructure for this — it is built and sitting
idle**). Pair with a "done-for-you" on-ramp: AI Chatbot Setup at Rs 15,000 (chatbot + deployment
+ portal), Octively underneath. This converts better than pure self-serve.

### Engine D — Free tools + case studies, start once customer #1 exists
7 tools already live at `/tools` (chatbot ROI/pricing/retainer calculators, FAQ/welcome-message/
name generators, readiness checker — verified shipped per
`docs/octively-validation-and-distribution-plan.md` §5 and `docs/free-tools-seo-research.md`
Batch 1). Remaining work is distribution (share + cross-link), not more tool-building — Batch 2
(proposal generator, cost-per-lead calculator, support-deflection calculator, persona generator)
stays backlog until Batch 1's traffic is measured. **Case Study Machine** (document customer #1
end-to-end) is blocked on rung 3 of the ladder existing.

**Gate to move to Track C:** GA4 traffic trending up AND the validation-sprint tracker shows
≥10-15 real conversations logged. Acquisition without activation infrastructure ready is wasted
spend of the scarcest resource (founder time), so do not neglect §Track A signals while running this.

---

## Track C — Monetization (embeds live, no upgrades)

Symptom from §0.4: real third-party bots are running, conversations/leads are flowing, but
`paidDevelopers`/`freeToPaidRatePct` stay flat.

1. **Confirm the self-serve purchase path actually works end to end**, don't assume from docs.
   `RoadmapPage.tsx` still lists "PayFast (PKR) + Lemon Squeezy (USD) billing" under `PLANNED`
   as of 2026-07-06 — but `app/(dashboard)/dashboard/billing/page.tsx`,
   `app/api/billing/payfast-url`, `app/api/billing/payfast-plan-url`, and both webhook handlers
   all exist, and `specs/004-monetization-go-live/spec.md` describes them as built (only the two
   URL-generation routes were the gap, and they exist now). **This is unresolved doc drift** —
   before running a monetization push, manually click through Rs top-up and plan-upgrade on a
   test org and confirm credits/plan actually change. If the roadmap is right and something is
   silently broken, that is the real monetization blocker, fix it first (Behavior-class, full
   gates) before doing any outreach.
2. **Referral flywheel** — every paying customer gets contacted within 3 days:
   "If you refer another agency owner who signs up, I'll waive your fee for 6 months." Track
   manually via spreadsheet or `getAffiliateStats()` if run through an affiliate coupon instead.
   Automate only after 50 customers (both source docs agree — do not build automation early).
3. **5 Free Testers → Founding Member conversion** (GTM doc §Phase 1): offer exactly 5 free
   spots (scarcity), ask after 2 weeks if it's been useful, convert to Starter/Pro. Customers
   6-10 get Founding Member pricing — **this is a pricing decision, owner-approval required**
   (`octively-change-control` owner-approval list #2) before quoting any non-published rate.
4. **Product Hunt**, gated behind 5 active users, is an amplifier here, not a first channel —
   see GTM doc §Phase 2 for the pre-launch checklist and realistic conversion ranges (top-5 day:
   4-14 paid conversions; #1: 20-30). The `PHLAUNCH50` 50%-off code is a pricing decision —
   confirm it is still owner-approved before reusing it.

**Gate for "solved":** ladder rung 4 (3 paying customers) reached, then rung 5 (a month-2
retained payer) before declaring the monetization problem solved — a one-time top-up is not
proof of a repeatable paid funnel.

---

## Ranked Solution Menu (mined from the repo's own GTM corpus)

Ordered by effort : evidence-obligation ratio. "Evidence obligation" = what you must measure
before claiming it worked (per `octively-research-methodology`).

| Rank | Move | Effort | Evidence obligation | Source |
|---|---|---|---|---|
| 1 | Validation sprint (20 interviews, 4 questions, tracked) | Founder time only | 5+ "I'd use this today" out of 20 | `docs/outreach-guide.md`, `docs/octively-validation-and-distribution-plan.md` §4 |
| 2 | Founder DM every new signup | Founder time only | Reply rate + segment data collected | Engine B |
| 3 | Build-in-public 2-3x/week (LinkedIn+X) | ~1hr/post via skills | Follower growth + inbound DMs, not vanity likes | Engine A |
| 4 | Slack/Google-Sheets lead connectors — **verify shipped status first** (Slack lead alerts are already in `RoadmapPage.tsx` SHIPPED; Google Sheets connector is NOT in SHIPPED, IN_PROGRESS, or PLANNED — it is genuinely still backlog, contradicting the difficulty doc's framing of it as a "build now" item not yet started) | Sheets: ~1wk (OAuth) | Adoption rate among paying orgs, not raw build completion | `docs/feature-difficulty-ranking.md` #5 (re-verify against `RoadmapPage.tsx` before starting — 3 of its 4 "build now" items are already shipped as of 2026-07-06) |
| 5 | Affiliate/partnership push (20 agencies, 20% commission) — infra already built and idle (§0.2) | Outreach time only, zero new code | `getAffiliateStats().totalReferrals` moving off zero | Engine C |
| 6 | Free-tools distribution (share the 7 live tools, don't build Batch 2 yet) | Sharing time only | Traffic + email captures per tool, GA4 by channel | Engine D, `docs/free-tools-seo-research.md` |
| 7 | Done-for-you productized setup (Rs 15,000) as an on-ramp | Founder delivery time | Conversion rate of setup buyers into ongoing retainer/plan | Engine C |
| 8 | Case Study Machine (customer #1 documented end-to-end) | Low, once unlocked | Gated on ladder rung 3 existing — do not fabricate a case study | Engine D |
| 9 | Product Hunt launch | 1 day prep | Gated behind 5 active users; measure signups AND paid conversions separately | GTM doc §Phase 2 |
| 10 | SEO/blog content (11 published, more drafted in Sanity) | Ongoing, compounding | 6-12 month horizon — do not expect near-term signups from this | GTM doc §Phase 3, `docs/owflex_master_plan_v7.md` |

---

## Known WRONG paths (fenced off explicitly)

| Wrong move | Why it's wrong | Correct gate |
|---|---|---|
| Building the WhatsApp Business API channel now | Explicitly gated: `specs/006-whatsapp-channel/spec.md` line 5, "Planned (build only after ~10 paying customers)" | Ladder rung 6 |
| Building any Tier-3/4 item from `docs/feature-difficulty-ranking.md` (full REST API, custom portal subdomain, client invoicing, self-hosted, mobile app) | All deferred past PMF or gated behind traction per that doc's own "Recommended build order" section | 10 paying customers minimum, most later than that |
| Discounting or changing published pricing unilaterally | Pricing is on the owner-approval list (`octively-change-control`) — it is the unit-economics moat, not a lever an AI session pulls alone | Ask the owner first, always |
| Buying ads, tools, or any paid service to accelerate this | Free-tier-first is hard law (owner-confirmed 2026-07-06); "No paid ads until Rs 100k-200k MRR" (GTM doc §Distribution Engines) | Present the cost, wait for explicit sign-off |
| Adding a feature nobody asked for because it "feels productive" | The named failure mode of the prior version of this product ("v6 died of this," project memory); also failure-mode #10 in the red-team list | Feature-freeze discipline (§8 below) |
| Marking an unshipped or partially-shipped feature SHIPPED in `RoadmapPage.tsx`/`ChangelogPage.tsx` to look more finished | Directly forbidden by the Changelog+Roadmap Sync Rule (`CLAUDE.md`) — verify in the codebase before ever proposing SHIPPED | `octively-docs-and-copy` |
| Launching Product Hunt or treating SEO as a first acquisition channel before validation | Both source docs independently correct this same mistake from an earlier plan version | Phase 1 gate first |

## Feature-freeze discipline (§8 reference)

Until 10 paying customers (ladder rung 6), every feature request is judged by one question:
**"Will this directly help acquisition or retention?"** If not, it goes to backlog. This is
`docs/octively-validation-and-distribution-plan.md` §8, restated here because it is the rule
this entire skill exists to enforce.

---

## Validation-and-promotion protocol

Every experiment (a new post cadence, a new outreach script, a pricing conversation opener)
must, before it runs:

1. State the metric and the predicted number (`octively-research-methodology`'s evidence bar —
   a hunch is not a plan until it has a number attached).
2. Run it, using the instrumentation already in place: GA4 events + UTM (acquisition),
   `getPlatformStats()`/`getAffiliateStats()` (activation/monetization), the manual tracking
   sheet (`docs/outreach-guide.md` §Part 6) for validation-sprint conversations that never touch
   the DB.
3. Record the result in a docs-conformant location — do not invent a new tracking file; update
   the existing living doc it came from (e.g., append to
   `docs/12_methods_to_get_saas_clients.md` "Our Results So Far," update the GTM doc's Launch
   Status table) so the next session inherits real history instead of re-deriving it. This itself
   is a doc-of-record edit — route it through `octively-docs-and-copy`'s discipline (date-stamp
   it, don't silently overwrite a prior number).
4. Only after a result is recorded does a channel get "doubled down on" — per the GTM doc's
   Month 3 instruction: "Analyze UTM data. Double down on best channel." Not before.

---

## Provenance and maintenance

Date-stamped 2026-07-06/07. Re-verify these before trusting them in a future session — GTM docs
drift fast and this skill only summarizes them:

| Fact | Re-verification command |
|---|---|
| Funnel numbers (signups, activation, paid, MRR) | Read `admin.octively.com/dashboard/admin/metrics` or re-run `getPlatformStats()` in `lib/db/queries/admin.ts` |
| Affiliate program adoption | Read the affiliate admin page or re-run `getAffiliateStats()` in `lib/db/queries/affiliates.ts:352` |
| Validation-sprint live tally | Re-open `docs/12_methods_to_get_saas_clients.md` "Our Results So Far" section |
| Whether billing self-serve actually works | Manually click a credit top-up + a plan upgrade on a test org; check `RoadmapPage.tsx` vs `app/(dashboard)/dashboard/billing/page.tsx` for drift before trusting either |
| Whether the WhatsApp/Tier-3/4 gate has been hit | `SELECT COUNT(DISTINCT org_id) FROM organizations WHERE plan != 'free'` ≥ 10 |
| Free-tools-live count and URLs | `ls "app/(marketing)/tools"` (route group, public URL is still `/tools`) or re-check `docs/octively-validation-and-distribution-plan.md` §5 |
| Whether `RoadmapPage.tsx`/`ChangelogPage.tsx` still show the specific drift noted here (affiliate program absent, billing still PLANNED) | `grep -in affiliate components/marketing/ChangelogPage.tsx components/marketing/RoadmapPage.tsx`; re-read the `SHIPPED`/`IN_PROGRESS`/`PLANNED` arrays in `RoadmapPage.tsx` |
| GA4 measurement ID / whether analytics is still wired | `grep NEXT_PUBLIC_GA_MEASUREMENT_ID .env.example` and confirm the tag renders in `app/layout.tsx` |
