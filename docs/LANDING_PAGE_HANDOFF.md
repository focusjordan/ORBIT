# ORBIT — Landing Page Spec

## Goal: orbit.ohnrshyp.com

A single-page site that makes a label or distributor immediately understand what ORBIT is, why their current stack has a gap, and why ORBIT is the one thing that closes it. No code. No documentation. No implementation details. Just the clearest possible case for why you need this.

---

## Positioning

**ORBIT is not a replacement for anything you already use.**

It's the one additional layer you're missing. You already have delivery pipelines, identification services, and dashboards. ORBIT is the machine learning infrastructure that sits alongside all of it — screening, verifying, and registering every track at machine speed so you stop scaling headcount every time submissions grow.

---

## Page Flow

The page is one continuous scroll. Every section builds on the last. The reader should never feel confused about what ORBIT is. By the time they reach the bottom, the only question should be "how do I start?"

---

### Section 1: Hero

**Headline:**
> The machine learning layer your catalog is missing.

**Subhead:**
> You already have identification services. You already have delivery pipelines. You already have dashboards. ORBIT is the one thing you're missing — the AI-powered screening and verification layer that makes everything you already have work at the speed music is growing.

**CTA:**
> [Talk to Us]

**Design note:** No animation. No particle effects. Clean, dark, confident. The headline should hit immediately. The subhead should take five seconds to read and leave zero ambiguity about what this is.

---

### Section 2: The Reality You're Operating In

This section makes the reader feel seen. It describes their world accurately and specifically. No exaggeration — just the truth framed sharply.

**Headline:**
> Submissions are scaling. Your screening isn't.

**Three columns (or stacked on mobile), each with a short stat and explanation:**

**Column 1:**
> **$8–29K/mo in screening labor**
>
> You have 2–5 people listening to every submission. Checking for AI-generated content. Verifying ownership claims. Cross-referencing metadata. They get fatigued, they're inconsistent, and they can't analyze audio at a signal level. Every new batch of submissions means more hours, more headcount, more cost.

**Column 2:**
> **$7–50K per song when something slips through**
>
> A missed duplicate. A fraudulent registration. An ownership conflict that doesn't surface until there's a dispute. There is no way to retroactively prove provenance if you didn't capture it at intake. By the time you find out, it's a legal problem.

**Column 3:**
> **$2B+ lost industry-wide to metadata failure every year**
>
> Rights data breaks in transit between platforms. Royalties go unclaimed. Ownership records contradict each other. Every label and distributor absorbs a share of that. The infrastructure to prevent it doesn't exist in most stacks.

**Design note:** These should feel heavy. Red or muted-red accent for the dollar figures. The reader should feel the weight of what they're currently absorbing.

---

### Section 3: The Gap in Your Stack

This is the diagram section. It needs to be visually clear and immediately legible. The reader should look at it and think "that's exactly right — I have all of that, but I don't have that middle piece."

**Headline:**
> Your stack has everything except the part that screens.

**Diagram concept — a horizontal pipeline showing a typical distributor's infrastructure:**

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  Submissions │    │  YOUR STACK  │    │   Catalog &   │
│   arrive     │───▶│              │───▶│  Distribution │
│              │    │  • Delivery  │    │              │
│  Tracks,     │    │    pipeline  │    │  DSPs, stores │
│  metadata,   │    │  • ID service│    │  royalty      │
│  DDEX/XML    │    │  • Dashboard │    │  collection   │
└──────────────┘    └──────────────┘    └──────────────┘

                         ▲
                         │
                    ┌────┴─────┐
                    │  THE GAP │
                    │          │
                    │ Who's    │
                    │ screening│
                    │ at       │
                    │ intake?  │
                    └──────────┘
```

**Below the diagram:**

> Your identification services match known works. Your delivery pipeline moves files. Your dashboard tracks what's in the catalog. But none of them answer the questions that matter at intake:
>
> — Is this AI-generated?
> — Does this already exist in the commercial catalog?
> — Does the submitted metadata match what authoritative sources say?
> — Is someone trying to register a track they don't own?
>
> Right now, people answer those questions. ORBIT answers them at machine speed.

**Design note:** This diagram should be a proper designed visual — not ASCII art. Clean, minimal, dark background. The "gap" should visually stand out (highlighted border, pulsing accent, or similar). This is the most important visual on the page.

---

### Section 4: How ORBIT Fits

This section shows the same pipeline with ORBIT inserted. The gap is closed. The reader should feel relief.

**Headline:**
> One layer. Every track. No new hires.

**Diagram concept — the same pipeline, but now ORBIT fills the gap:**

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  Submissions │    │    ORBIT     │    │  YOUR STACK  │    │   Catalog &   │
│   arrive     │───▶│              │───▶│              │───▶│  Distribution │
│              │    │ • AI Screen  │    │  • Delivery  │    │              │
│  Tracks,     │    │ • Verify vs  │    │    pipeline  │    │  DSPs, stores │
│  metadata,   │    │   130M+      │    │  • ID service│    │  royalty      │
│  DDEX/XML    │    │   tracks     │    │  • Dashboard │    │  collection   │
│              │    │ • Corroborate│    │              │    │              │
│              │    │   metadata   │    │              │    │              │
│              │    │ • Flag fraud │    │              │    │              │
│              │    │ • Register   │    │              │    │              │
│              │    │   provenance │    │              │    │              │
└──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘
```

**Below the diagram, three outcome statements:**

> **Every track screened for AI content before it enters your catalog.**
> Not a sample. Not a spot check. Every single submission, analyzed at a signal level — classified as human, AI-generated, or flagged for review. Automatically. 24/7.

> **Every submission verified against 130 million+ fingerprints.**
> Cross-referenced against open and commercial catalogs in real time. If a track already exists — as a duplicate, a known work, or a fraudulent re-upload — ORBIT catches it before it's registered.

> **Every metadata claim corroborated against authoritative sources.**
> Title, artist, ISRC, label — validated against the databases that matter. If someone submits "Dreams" by "Fleetwood Mac" and they're not Fleetwood Mac's distributor, the mismatch is flagged instantly.

**Design note:** These three blocks should feel like relief after the heaviness of Section 2. Green or cyan accents. Checkmarks or shield icons. The emotional arc is: pain → gap → resolution.

---

### Section 5: What This Changes For You

This section is about outcomes, not features. No technical details. Just what life looks like after.

**Headline:**
> Stop scaling headcount. Start scaling with machine learning.

**Two-column layout: BEFORE / AFTER**

| Before ORBIT | After ORBIT |
|---|---|
| 2–5 people screening submissions manually | Every track screened automatically at intake |
| Inconsistent reviews — depends who's listening | Consistent, signal-level analysis on every file |
| Fraud caught after registration, during disputes | Fraud caught before it enters your catalog |
| Metadata validated by spreadsheet comparison | Metadata corroborated against 130M+ known works |
| AI content detected by guesswork and gut feeling | AI content classified by machine learning models |
| Scale submissions = scale headcount | Scale submissions = same team, faster throughput |

**Below the table:**

> You don't need to build an internal AI system. You don't need to hire ML engineers. You don't need to replace your identification vendor or rip out your delivery pipeline. You need one additional layer between intake and your existing stack. That's ORBIT.

---

### Section 6: The Bigger Picture

This is where watermarking and the transfer protocol live — but framed as the future you're building toward, not the thing you're buying today.

**Headline:**
> Today, ORBIT screens and verifies. Tomorrow, it proves.

**Copy:**

> Once a track is screened, verified, and registered through ORBIT, something permanent happens: the audio file itself carries its provenance. Identity is embedded directly into the waveform — invisible, inaudible, and surviving any format conversion, compression, or re-encoding.
>
> That means if a dispute arises six months from now, the proof isn't in an email thread or a spreadsheet. It's in the file.
>
> When the industry is ready, ORBIT's transfer protocol enables platform-to-platform handoffs with cryptographic proof of custody. No more manual rights documentation. No more he-said-she-said between distributors and DSPs.
>
> That's where this is going. But you don't have to wait for the industry to get there. You get value on day one — every track screened, verified, and registered before it touches your catalog.

**Design note:** This section should feel visionary but grounded. Slightly different visual treatment — maybe a subtle gradient shift or a waveform visual in the background. It's the "and there's more" moment, but it should never feel like the pitch. The pitch already happened. This is the bonus.

---

### Section 7: Pricing

Anchored against what they're already spending. The psychology is: you're already paying more than this for worse results.

**Headline:**
> A fraction of what you're spending on screening labor.

**Three pricing cards, horizontal:**

**Card 1:**
> **Setup & Integration**
> $1,500 one-time
>
> We configure ORBIT to work with your existing intake pipeline and dashboards. One-time. Done.

**Card 2:**
> **First Month**
> $4,000/mo
>
> 50% introductory rate. Full platform access. Every capability from day one.

**Card 3:**
> **Ongoing**
> $8,000/mo
>
> Rolling 6-month commitment. Cancel anytime after.

**Below the cards:**

> You're currently spending **$8–29K/mo** on screening labor alone — before infringement costs, before unclaimed royalties, before metadata failures compound across your catalog. ORBIT replaces the most expensive, least scalable part of your operation at a fraction of the cost.

**Design note:** The dollar figures in the anchor text below the cards should be in red or a muted warning color. The ORBIT pricing cards should feel clean, confident, green-accented. The visual contrast should make the math obvious.

---

### Section 8: CTA

**Headline:**
> Ready to close the gap?

**Copy:**
> Tell us about your catalog, your stack, and your intake volume. We'll show you exactly how ORBIT fits.

**CTA button:**
> [Schedule a Call] or [Email: support@ohnrshyp.com]

**Design note:** Simple. No form with 15 fields. Email or calendar link. Reduce friction to zero.

---

## Design Direction

### Overall Feel
- This is infrastructure, not SaaS. It should feel like the pitch deck for a serious B2B tool — not a consumer product landing page.
- Confident, quiet authority. No exclamation points. No "revolutionary." No "game-changing." The copy should be so clear it doesn't need hype words.
- Dark theme. Professional. The kind of page where an ops VP at a distributor reads it and forwards it to their CTO with "we need to talk about this."

### Color Palette
- Background: Near-black (#0a0a0a) or very dark gradient
- Primary accent: Electric cyan or teal (confidence, clarity)
- Warning/cost accent: Muted red or coral (for the "what you're spending" numbers)
- Success accent: Green (for the "what ORBIT changes" outcomes)
- Text: Off-white (#e0e0e0) with brighter white for headlines

### Typography
- Headlines: Clean, tight sans-serif with generous weight (700+)
- Body: Readable sans-serif, generous line height
- No monospace on the public site — this isn't a developer docs page
- Avoid: Inter, Roboto, Arial (too generic). Consider: Satoshi, General Sans, or similar modern sans.

### Visual Elements
- **The pipeline diagrams are the centerpiece.** They must be designed, not ASCII. Clean boxes, clear flow arrows, labeled stages. The "gap" diagram and the "ORBIT fills the gap" diagram are the two most important visuals on the page.
- Subtle waveform textures or audio-contextual graphics in backgrounds
- Shield/verification iconography for the outcomes section
- No stock photos. No smiling people in headphones. No generic "music industry" imagery.

### Animations (minimal)
- Scroll-triggered fade-ins for each section
- The "gap" in the pipeline diagram could pulse or glow subtly
- Numbers in the cost section could count up on scroll
- No parallax. No particle effects. No loading animations that delay content.

---

## Content Rules (Apply to Every Page)

- **No code examples.** We don't show how the system works internally.
- **No API documentation.** Integration details are shared after contact.
- **No SDK references.** No package names, no protocol names, no endpoint paths.
- **No external documentation links.** Technical docs are provided to customers post-engagement, not published.
- **No GitHub links.** The repo is not public-facing from this page.
- **No feature comparison tables against specific vendors.** We reference "identification services" and "delivery pipelines" generically — never by name.
- **Every page focuses on WHY, not HOW.** Explain the problem, explain why ORBIT solves it, explain what changes. Never explain the implementation.
- **Every page ends with a CTA.** Same CTA: schedule a call or email. Every page is an on-ramp.

---

## Site Structure

```
orbit.ohnrshyp.com/
├── /                         # Landing page (the full funnel described above)
├── /ai-screening             # Why you need AI content detection at intake
├── /catalog-verification     # Why you need fingerprint verification at scale
├── /metadata                 # Why metadata breaks and how corroboration prevents it
├── /automation               # Why autonomous catalog management changes the economics
├── /provenance               # Why embedded provenance is where the industry is going
└── /contact                  # Contact form or calendar booking
```

The landing page is the primary conversion path. The secondary pages are for readers who want to go deeper on a specific capability before reaching out. Each secondary page reinforces the same message: here's the problem, here's why your current stack doesn't solve it, here's what ORBIT changes. Every page drives to the same CTA.

The landing page should link to these secondary pages from the relevant sections — the AI screening outcome links to `/ai-screening`, the fingerprint verification outcome links to `/catalog-verification`, etc. They're depth, not distraction.

---

## Secondary Pages

---

### /ai-screening — AI Content Detection

**Purpose:** Convince the reader that AI-generated music is an operational problem they can't solve with people, and that ORBIT's detection capability is the answer.

**Headline:**
> AI-generated music is already in your catalog. You just don't know which tracks.

**The problem:**

> The volume of AI-generated music submissions is growing faster than any team can manually screen. AI music tools are public, free, and improving monthly. The output is increasingly difficult to distinguish from human recordings by ear alone.
>
> Your identification services don't screen for AI content — they match known works. Your review team listens for obvious tells, but AI-generated audio doesn't always have obvious tells. It has subtle statistical signatures in the waveform that humans can't detect.
>
> If AI-generated content enters your catalog undetected:
>
> — It dilutes your legitimate artists' revenue through streaming fraud
> — It exposes you to takedowns and platform penalties
> — It undermines trust with DSPs who expect a curated, verified catalog
> — It's nearly impossible to identify and remove after distribution

**What ORBIT does (top-level, no implementation details):**

> ORBIT analyzes every submission at a signal level before it enters your catalog. It's not listening for quality or "vibes" — it's running machine learning models that detect the statistical fingerprints of AI-generated audio.
>
> Every track receives a classification:
>
> — **LIKELY HUMAN** — Proceed to registration
> — **REVIEW** — Flagged for human review with a confidence score and specific signals
> — **LIKELY AI** — Blocked from registration, flagged for investigation
>
> This happens automatically on every submission. No batching, no sampling, no spot checks. Every track, every time, at machine speed.

**Why this matters for your business:**

> You're not just screening for compliance — you're protecting your catalog's integrity. DSPs are tightening enforcement on AI content. Distributors who can prove their catalog is screened have an advantage. Distributors who can't are absorbing risk on every track they deliver.
>
> ORBIT gives you a defensible screening process. If a DSP flags a track, you can show it was analyzed before distribution — with a classification, confidence score, and timestamp. That's not just detection. That's a paper trail.

**CTA:**
> Want to see how ORBIT screens against your actual catalog? [Talk to Us]

---

### /catalog-verification — Fingerprint Verification at Scale

**Purpose:** Convince the reader that incoming submissions need to be verified against the global catalog before registration, and that ORBIT does this automatically across 130M+ tracks.

**Headline:**
> Someone is going to try to register a track they don't own. The question is whether you catch it at intake or in a courtroom.

**The problem:**

> Fraudulent registration is a growing problem across the distribution chain. Bad actors submit well-known tracks under fake artist names. They register covers without licensing. They re-upload existing catalog tracks to new accounts to siphon streaming revenue.
>
> Your identification services catch some of this — but only for tracks already in their index. And they're designed for matching at the DSP level, not at your intake. By the time your identification vendor flags a conflict, the track may already be distributed.
>
> The gap is at intake. Before a track enters your catalog, you need to know:
>
> — Does this audio already exist in the global commercial catalog?
> — Does the submitted metadata match what's on record for this audio?
> — Is the person registering this track the legitimate rights holder?

**What ORBIT does:**

> ORBIT fingerprints every incoming submission and cross-references it against 130 million+ tracks — spanning open and commercial databases that cover the vast majority of distributed music worldwide.
>
> If the audio matches a known work, ORBIT doesn't just flag it — it corroborates. It compares the submitted title, artist, ISRC, and label against what authoritative sources say about that recording. If the metadata matches, the submission is verified. If it doesn't, the mismatch is flagged before registration ever happens.
>
> This is the difference between catching fraud after distribution and catching it at the door.

**The economics:**

> A single fraudulent registration that makes it to distribution can cost $7–50K in legal fees, takedown processing, and lost royalties. A catalog-wide audit to find bad registrations after the fact costs even more — in time, headcount, and reputation.
>
> ORBIT runs this check on every track, every time, automatically. The cost of prevention is a fraction of the cost of remediation.

**CTA:**
> See how ORBIT verifies against your intake volume. [Talk to Us]

---

### /metadata — Metadata Corroboration

**Purpose:** Convince the reader that metadata failure is a systemic problem costing them real money, and that automated corroboration is the only scalable solution.

**Headline:**
> Bad metadata doesn't just lose royalties. It compounds across every track, every platform, every quarter.

**The problem:**

> Metadata is the connective tissue of the music business. It determines who gets paid, how tracks are identified, and whether rights can be enforced. And it breaks constantly.
>
> Rights data lives in spreadsheets, DDEX/XML documents, and platform-specific databases that rarely agree with each other. A misspelled artist name, a missing ISRC, a wrong label attribution — each one is small. But they compound. Across thousands of tracks, across multiple DSPs, across years of catalog.
>
> The industry loses over **$2 billion annually** to metadata-related failures. Unclaimed royalties. Misattributed works. Ownership disputes that could have been caught at registration if anyone had checked.
>
> Nobody checks. Not at scale. Not systematically. Not at intake.

**What ORBIT does:**

> ORBIT corroborates every piece of submitted metadata against authoritative music databases — automatically, at registration time.
>
> When a track is submitted with a title, artist, ISRC, and label, ORBIT doesn't just store those fields. It checks them. Against the global catalog. Against known recordings. Against the metadata that other authoritative sources have on file for that same audio.
>
> The result is a corroboration score: how much of what was submitted matches what the world already knows about this recording. A high score means the submission is legitimate and consistent. A low score means something doesn't add up — and it gets flagged before it enters your catalog.
>
> This catches:
>
> — Submissions with fabricated metadata (fraud)
> — Submissions with incorrect metadata (human error)
> — Submissions where the audio and the claimed metadata don't match (misattribution)
>
> All of this happens before distribution. Before the metadata propagates to DSPs. Before it becomes someone else's problem to untangle.

**Why this matters:**

> You can't fix metadata after distribution at scale. It's too distributed, too fragmented, too expensive. The only viable strategy is to validate it at the source — at intake, before it enters your catalog and propagates downstream.
>
> ORBIT makes that validation automatic. No spreadsheet comparisons. No manual lookups. Every track, every field, checked against the global record — at machine speed.

**CTA:**
> Stop losing royalties to bad metadata. [Talk to Us]

---

### /automation — Autonomous Catalog Management

**Purpose:** Convince the reader that catalog operations should be autonomous — running 24/7 without human intervention — and that ORBIT is built for exactly that.

**Headline:**
> Your catalog doesn't sleep. Your operations shouldn't either.

**The problem:**

> Music submissions don't arrive during business hours. They arrive constantly — from artists, from aggregators, from partner platforms, from catalog migrations. Your intake is a firehose, and it runs 24/7.
>
> But your team doesn't. Your review process has business hours, backlogs, and bottlenecks. Submissions queue up. Screening waits for the next available person. Registration waits for screening. Distribution waits for registration. The whole pipeline moves at the speed of your slowest manual step.
>
> And every time submission volume increases — a new artist roster, a catalog acquisition, a seasonal surge — the bottleneck gets worse. The only answer you've had is more headcount. More reviewers, more coordinators, more people managing the same repetitive process.

**What ORBIT does:**

> ORBIT is designed to run autonomously. Not as a tool you open and click through — as infrastructure that monitors, processes, and manages your catalog without human intervention.
>
> Point ORBIT at your intake pipeline. Every new submission is automatically:
>
> — Screened for AI-generated content
> — Fingerprinted and verified against the global catalog
> — Metadata corroborated against authoritative sources
> — Classified, flagged, or registered based on the results
> — Logged with a complete audit trail
>
> Human review only happens when ORBIT flags something that genuinely requires judgment. Everything else flows through automatically.
>
> ORBIT integrates with the AI agent frameworks and automation platforms your engineering team already uses. Every operation produces structured, machine-readable output — designed to feed into your existing dashboards, alerting systems, and workflow tools.

**The shift:**

> This isn't about making your team faster. It's about removing the constraint entirely.
>
> With ORBIT, your catalog operations scale with your catalog — not with your headcount. A 10x increase in submissions doesn't mean a 10x increase in reviewers. It means the same infrastructure handles more volume, at the same speed, with the same consistency.
>
> The people on your team stop spending their time on repetitive screening and start spending it on the decisions that actually require human judgment.

**CTA:**
> See how ORBIT automates your intake pipeline. [Talk to Us]

---

### /provenance — Embedded Provenance

**Purpose:** Explain the long-term vision — audio that carries its own identity — without making it the primary selling point. This is the "where this is going" page for readers who want to understand the bigger picture.

**Headline:**
> What if the audio file could prove its own origin?

**The current state:**

> Provenance in the music industry is documented externally. It lives in databases, spreadsheets, contracts, and platform-specific records. If you need to prove who registered a track, when, and through what chain of custody, you're assembling evidence from multiple systems — none of which were designed to agree with each other.
>
> This works until there's a dispute. Then it becomes an exercise in forensic archaeology: pulling records from different platforms, cross-referencing timestamps, trying to reconstruct who had what, when. It's expensive, it's slow, and the outcome often depends on which party has better record-keeping.

**Where ORBIT is going:**

> ORBIT doesn't just record provenance in a database. It embeds it directly into the audio file.
>
> When a track is registered through ORBIT, an invisible, inaudible watermark is written into the waveform itself. This watermark survives compression, format conversion, pitch-shifting, and re-encoding. It's not metadata that can be stripped. It's not a database entry that can be deleted. It's in the audio.
>
> That means if a dispute arises — six months, a year, five years from now — the proof isn't in an email thread or a spreadsheet. It's in the file. Any platform with ORBIT verification can read it. The audio proves its own origin.
>
> Every registration also creates a cryptographic signature — a mathematical proof that a specific platform registered a specific track at a specific time. These signatures chain together. If a track is transferred between platforms, both signatures are recorded. The chain of custody is permanent, verifiable, and doesn't depend on any single platform's records.

**Why this matters for your business today:**

> You don't need the entire industry to adopt ORBIT for this to be valuable to you. Every track you register through ORBIT carries its provenance from that moment forward. You're building a defensible record of your catalog — track by track, registration by registration.
>
> If a dispute arises over a track you registered through ORBIT, you have cryptographic proof. Not a screenshot of a spreadsheet. Not a timestamped email. A mathematical proof embedded in the audio and recorded on a shared ledger.
>
> The industry will get here eventually. Every distributor who starts building their provenance record now will have an advantage when it does.

**CTA:**
> Start building your provenance record today. [Talk to Us]

---

## Page Linking Strategy

The landing page references each capability in its natural flow. Each reference links to the corresponding secondary page for readers who want depth:

| Landing Page Section | Links To |
|---|---|
| "Every track screened for AI content" outcome block | /ai-screening |
| "Every submission verified against 130M+ fingerprints" outcome block | /catalog-verification |
| "Every metadata claim corroborated" outcome block | /metadata |
| Section 6: "Today, ORBIT screens and verifies. Tomorrow, it proves." | /provenance |
| Automation section (if referenced in landing page) | /automation |

Every secondary page also links back to the landing page and to the contact CTA. Navigation is minimal: ORBIT logo (home), the secondary page links, and a persistent "Talk to Us" button.

---

## Content Rules (Apply to Every Page)

- **No code examples.** We don't show how the system works internally.
- **No API documentation.** Integration details are shared after contact.
- **No SDK references.** No package names, no protocol names, no endpoint paths.
- **No external documentation links.** Technical docs are provided to customers post-engagement, not published.
- **No GitHub links.** The repo is not public-facing from this page.
- **No feature comparison tables against specific vendors.** We reference "identification services" and "delivery pipelines" generically — never by name.
- **Every page focuses on WHY, not HOW.** Explain the problem, explain why ORBIT solves it, explain what changes. Never explain the implementation.
- **Every page ends with a CTA.** Same CTA: schedule a call or email. Every page is an on-ramp.

---

*Original handoff: December 24, 2025*
*Repositioned: March 27, 2026 — pure conversion site, no technical exposure*
