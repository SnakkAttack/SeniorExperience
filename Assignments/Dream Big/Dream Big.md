# Dream Big Project: Team Agreement & Concept

CS 4360 Senior Experience. First team assignment.

Note for the team: this assignment says it's practice, not our final project. We're using our real candidate idea anyway. It costs nothing, it gets us early feedback from Mota on the thing we actually want to build, and if it holds up here, the final proposal is already half written.

---

## 1. Team Agreement & Working Style

**Primary Communication Channel:** Slack (dedicated server with channels for standup, dev, links/research, and off-topic)

**Weekly Meeting Schedule:** One 30-minute standup per week outside class on either Tuesday, Thursday, or Friday. Proposal: Sunday evening, since it sets up the week.

**Response Expectation:** Reply within 24 hours on weekdays, 48 on weekends. Reacting with an emoji counts as an acknowledgment. If you're going dark for a few days (exams, work), say so in advance in the standup channel.

**Decision rule:** We talk it out, and if we're split, the module owner makes the call for their module. Disagreements are about the work, never the person.

---

## 2. Roles & Contribution Profiles

**Name:** Gage Gunn
**Assigned Role:** Technical Lead / Developer
**Technical/Professional Strengths:**
1. Python and C++ development, Git/Jira workflow, prior software lead experience on a NASA RockSat-X payload team
2. Years of customer-facing technical diagnostics and repair (Geek Squad Advanced Repair), which translates to debugging under pressure and explaining technical problems in plain language
**Skill to Improve This Semester:** Applied ML/NLP, specifically training and properly evaluating text classifiers (precision/recall/F1, held-out validation) rather than just consuming model APIs
**Preferred Working Style:** Mix of async and live sessions; prefers evenings and weekends due to work schedule; likes clear written task definitions in Jira before starting

**Name:** Sam Holton
**Assigned Role:** Project Manager / Documentation Lead / Developer
**Responsibilities (team-agreed):** Owns the project schedule, meeting agendas, and the written deliverables (proposal, status reports, final documentation). Runs the weekly standup and tracks task status in Jira, and contributes to implementation.
**Technical/Professional Strengths:**
1. Organization and written communication: keeping schedules, agendas, and documentation current, and turning technical work into clear writing for a non-technical reader
2. General software development from coursework and team projects, including Git-based collaboration and code review
**Skill to Improve This Semester:** Running a project end to end on a real deadline: scoping work into trackable tasks, estimating how long things actually take, and keeping documentation in sync with a codebase that is still changing
**Preferred Working Style:** Primarily async with a weekly live sync; prefers decisions written down in the channel or in Jira so there is a record, rather than settled verbally and forgotten

**Name:** Jaiden Searle
**Assigned Role:** Documentation / Developer
**Responsibilities (team-agreed):** Shares implementation work across the pipeline and client, owns his assigned modules end to end, participates in code review, and keeps technical documentation for his modules current.
**Technical/Professional Strengths:**
1. Programming and problem solving from coursework, comfortable picking up an unfamiliar language or framework when a project calls for it
2. Debugging and testing: reading unfamiliar code, tracing a problem to its source, and documenting what was actually wrong
**Skill to Improve This Semester:** Working in a shared codebase at scale: branching and merging cleanly, writing code other people can read and maintain, and giving useful code review instead of just approving
**Preferred Working Style:** Mix of async and live; prefers a clearly defined task with a stated goal before starting, and a quick call when a problem needs to be talked through rather than typed out

---

## 3. "Dream Big" Project Concept

**Project Name:** Receipts (working title, final name TBD). Tagline: automated privacy policy analysis. The name comes from our core design rule: every claim the system makes has to show the receipt, meaning the exact quoted clause from the document that proves it.

**Problem Statement:**
Nobody reads privacy policies or terms of service. They're long, deliberately dense, and written to be agreed to rather than understood, so people hand over rights to their data (what gets collected, sold, retained, and now used to train AI models) without knowing it. Tools that try to fix this exist and split into two camps that both fail: volunteer-curated projects like ToS;DR are trustworthy but cover only a few hundred services after 13 years, with grades that silently go stale, while a wave of AI browser extensions can read anything but publish no methodology, no accuracy numbers, and hide behind paywalls, so nobody trusts or uses them. The result: for the overwhelming majority of sites, there is no usable answer to "what am I agreeing to?"

**Target Users:**
Anyone deciding whether to sign up for a website or app, at the moment of decision. Secondary users: privacy-conscious people auditing services they already use, researchers and journalists studying data practices at scale, and the existing volunteer-rating community (our system flags when their human-written grades have gone stale after policy changes, which helps them rather than competes with them).

**High-Level Architecture & Tech Stack:**
A central analysis pipeline, one public database, and thin clients.
- Discovery/fetch service: locates and extracts policy and ToS text from arbitrary sites (link heuristics, headless browser fallback), normalizes it, and stores hashed document versions. 
- ML segment classifier: a text classifier trained on OPP-115, an expert-annotated corpus of 115 privacy policies labeled across 10 data-practice categories by law students. It routes each policy segment to the practice categories it discusses. Trained and evaluated with proper held-out validation (precision/recall/F1 per category), then deployed live in the pipeline. This is the machine learning core of the project.
- LLM extraction layer: for relevant segments only, an LLM answers a fixed rubric of enum questions (for example: sells data? yes / shares for value / no / not disclosed) and must return the verbatim quote supporting each answer; quotes are programmatically verified to exist in the source before any finding is accepted.
- Deterministic scorer: findings map to points, points to per-category tiers. No model ever assigns a score. Everything versioned so rubric changes are distinguishable from company changes.
- Monitoring: daily hash checks re-analyze documents only when they actually change, producing a change feed ("this site changed its AI training clause last week").
- Clients: a website with per-service scorecards, search, and a request-a-site queue (Next.js/TypeScript, Postgres), plus a lightweight browser extension showing a badge that pulls from the same API. Analyze once, cache centrally, serve everyone free.

**Innovation Factor:**
We studied roughly twelve prior attempts, and every one died on one of two hills: human-curated projects have trust but can't scale (volunteer labor), AI projects scale but built no trust (no rubric, no evaluation, closed source, per-request costs forcing paywalls). Academic work (Polisis, USENIX 2018) proved automated extraction viable years ago but was never productized. No project combines a public vetted rubric, AI extraction with verified quoted evidence, validation against the existing human ground truth (we measure our agreement rate against ToS;DR's graded services and report it), and continuous change detection with staleness flags. We're deliberately building that empty intersection, and every rating carries the quote that proves it.

**Top Technical Risk:**
Reliably finding and extracting policy text from arbitrary websites. Policies are buried behind inconsistent links, rendered by JavaScript, split across pages, or embedded in unrelated legal pages, and if extraction fails, everything downstream is analyzing garbage. Our mitigation: this is week one's spike (target: clean extraction on 16 of 20 random sites), with a predefined fallback (user-pasted policy URLs plus a request queue) rather than a mid-semester surprise. Second-order risk: LLM extraction errors producing false claims about real companies, mitigated by the quote-verification gate, conservative "unclear" handling for low-confidence findings, and published accuracy numbers instead of asserted ones.
