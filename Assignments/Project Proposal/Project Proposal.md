# Preamble

* **Project Title:** Clause: Automated Privacy Policy and Terms of Service Analysis
* **Team Name:** Hydrated Homies for Human Data Rights
* **Members & Roles:**
  * Gage Gunn, Technical Lead, Developer
  * Sam Holton, Project Manager, Documentation Lead, Developer
  * Jaiden Searle, Documentation, Developer
  * Alex Kimoni, Documentation, Developer

# Executive Summary

Nobody reads privacy policies. They are long, dense, and written to be agreed to rather than understood, so people routinely surrender rights over their personal data without knowing it. Existing solutions split into two camps that each fail differently: volunteer-curated rating projects are trustworthy but have graded only a few hundred services in thirteen years, while a wave of AI browser extensions can read any document but publish no methodology or accuracy figures and have attracted almost no users.

Receipts is a web platform and browser extension that reads privacy policies and terms of service automatically, extracts specific data practices, and presents them with the exact quoted clause that supports each finding. A machine learning classifier trained on an expert-annotated corpus routes policy text to relevant practice categories, an extraction layer answers a fixed rubric of questions with verifiable quotes, and a deterministic scoring function produces category ratings that anyone can audit.

We will publish measured accuracy against expert annotations and against existing human-graded services, and monitor documents daily so users learn when terms quietly change.

# 1. The Problem

**Problem Statement**

Privacy policies and terms of service are the legal instruments through which people surrender control of their personal data, and almost nobody reads them. The documents are long, written in dense legal register, and structured so that consent is easy and comprehension is hard. This asymmetry is not accidental; it is the operating condition that makes large-scale data collection, sale, and now AI model training commercially viable. The specific gap we address is that for the overwhelming majority of websites and applications, there is no accessible answer to the question "what am I actually agreeing to?"

**Impact & Target Audience**

This affects essentially everyone who uses the internet, but the burden is unevenly distributed. Users in the United States have weaker statutory protections than users in the EU, and many services grant data access and deletion rights only to residents of jurisdictions that legally require them. People signing up for a new service have no practical way to compare it against alternatives on privacy grounds. The problem is worsening: generative AI services have introduced content licensing and model training clauses at a pace that no manual review process can track.

**Supporting Evidence**

We conducted a competitive and academic review of roughly twelve prior efforts in this space. Findings:

* Terms of Service; Didn't Read (ToS;DR), operating since 2012, is the established volunteer-curated rating project. Its own homepage states that many services do not yet have a grade assigned. Its Grade A listing fits on two pages while its internal service identifiers run past 7,000, indicating thousands of catalogued but ungraded services.
* User reviews independently confirm the coverage gap. One reviewer reported searching for Notion and TickTick and receiving no usable answer. A five-star review notes that because unpaid contributors write the summaries, many smaller companies and applications are missing.
* PrivacySpy, an open-source rubric-based rating project by a registered nonprofit, uses methodology very close to what we propose but depends on humans hand-authoring TOML files through GitHub pull requests. Its repository was last updated in March 2025 with 29 open issues, and community engagement is negligible.
* At least seven AI-powered browser extensions have launched since 2023 attempting automated analysis. The most complete of them reports 46 users and limits free accounts to two document analyses per month, a constraint imposed by per-request LLM costs. None publish a rubric, methodology, or accuracy evaluation, and none are open source.
* Academic work established feasibility years ago. Polisis (Harkous et al., USENIX Security 2018) achieved 88.4% accuracy on automated privacy icon assignment using neural classifiers trained on 130,000 policies, and was never developed into a maintained product.
* Consumer Reports operated Permission Slip, an app that exercised data rights on users' behalf, processing nearly five million requests before transferring it to a third party in 2026, demonstrating that even well-resourced organizations struggle to sustain consumer privacy tooling.

The pattern is consistent: human-curated projects earn trust but cannot scale, automated projects scale but establish no trust, and the academic approach that solves both was never productized.

# 2. Proposed Solution

**Core Concept**

A centralized analysis pipeline that reads privacy policies and terms of service, extracts specific data practices with verbatim supporting quotes, scores them against a published versioned rubric, and monitors them for changes. Results are cached centrally and served free through a website and a lightweight browser extension. The guiding metaphor is a nutrition label: we report what a document says and let the user decide, describing practices rather than motives.

**Key Features & Functionality**

* **Per-service scorecards.** Category ratings (data selling and sharing, AI training, collection scope, retention and deletion, user rights, government requests, security posture), each expandable to the individual findings and the exact clause quoted from the source document.
* **Evidence on every claim.** No finding is displayed without a verbatim quote that has been programmatically verified to exist in the source text. Where a policy is silent, we report "not disclosed" rather than inferring.
* **Long-tail coverage on request.** Any site with a reachable policy can be analyzed. A request queue with voting lets users add services we have not yet processed.
* **Change monitoring.** Tracked documents are re-fetched daily and hashed; a changed hash triggers re-analysis and publishes a change entry describing which practices moved.
* **Staleness detection.** Where an existing human-curated grade exists for a service, we compare its assignment date against subsequent policy revisions and flag grades that predate material changes.
* **Provenance labeling.** Findings are marked human-verified, machine-generated, or agreed, so users can weight them appropriately.
* **Browser extension.** A badge reflecting the cached rating for the current domain, with a warning surfaced at account signup. No analysis runs client-side and no account is required.

**Tech Stack & Tools**

* Python for the fetch, extraction, and ML pipeline; headless browser fallback for JavaScript-rendered documents
* PyTorch or scikit-learn with Hugging Face transformers for the policy segment classifier, trained on the OPP-115 corpus
* An LLM API for structured rubric extraction on classified segments
* PostgreSQL for services, document versions, findings, scores, and change history
* Next.js and TypeScript for the web frontend; a Manifest V3 browser extension as a thin API client
* Public data sources: the ToS;DR API (CC BY-SA) for human-graded ground truth, Open Terms Archive datasets for historical document versions, OPP-115 (Wilson et al., ACL 2016) for classifier training and evaluation
* Git and GitHub for version control, Jira for task tracking

**Value Proposition**

Existing alternatives fail in two distinct ways, and our architecture addresses both. Against volunteer-curated projects, we offer coverage and speed: a service that launches today can be analyzed in minutes rather than waiting indefinitely for a volunteer, and documents are re-checked daily rather than never. Against AI extensions, we offer trust infrastructure they lack: a published versioned rubric, quote verification on every finding, deterministic scoring code that anyone can read, an open-source codebase, and published accuracy measurements against expert annotations. Analyzing each document once and caching the result centrally reduces marginal cost to near zero, which is why we can be free and instant where competitors are forced into paywalls by per-request analysis. We position as complementary rather than competitive: human-curated grades remain the gold standard where they exist, and our staleness detection actively supports them.

# 3. Users and Stakeholders

**Primary Users**

* People evaluating whether to sign up for a website or application, at the moment of decision
* People auditing services they already use
* Researchers and journalists studying data practices across many services

**Key Stakeholders**

* **Course instructor.** Expressed interest in the concept and stated he would use the product, and is also the approver for the machine learning scope under the department's degree exception process.
* **Department chair and academic advising.** The project's ML component is being evaluated for concurrent credit toward the DSML 4360 requirement, which makes the classifier a required rather than optional deliverable.
* **The existing privacy-rating community.** ToS;DR and PrivacySpy publish data we consume under open licenses; our staleness detection returns value to them.
* **Team members.** Each owns a module and needs clear interfaces to work in parallel.

**User Needs & Pain Points**

| User group | Need | Pain point addressed |
|---|---|---|
| Prospective signup | A fast, glanceable verdict at the moment of decision | No existing coverage for most services |
| Privacy auditor | Specific practices with source evidence | Summaries without citations are unverifiable |
| Researcher | Structured, queryable data across many services | Policies exist only as unstructured prose |
| Rating community | Notification when curated grades go stale | No mechanism currently detects staleness |

# 4. Project Scope & Assumptions

**In-Scope**

* Document discovery, fetch, normalization, and version hashing
* Policy segment classifier trained and evaluated on OPP-115, deployed in the live pipeline
* Rubric-driven extraction with mandatory quote verification
* Deterministic category scoring with rubric and analysis versioning
* Daily change monitoring, change feed, and staleness flags against ToS;DR grades
* Public read API
* Website: scorecards, search, request queue, change feed, comparison view
* Browser extension as a thin client
* Evaluation harness producing published accuracy figures

**Out-of-Scope**

* Native mobile applications
* Email or account integration to detect existing signups (deep trust and operations burden; the best-resourced prior attempt at this model was discontinued)
* Automated exercise of data rights on a user's behalf
* Legal advice or interpretation beyond reporting what documents state
* Monetization of any kind
* Real-time client-side analysis in the extension

**Key Assumptions**

* Privacy policies and terms of service are publicly accessible documents requiring no authentication or special access. This is the load-bearing assumption and it is what makes the project feasible within one semester.
* OPP-115 remains available for research and teaching use with proper citation.
* The ToS;DR public API remains available under CC BY-SA 3.0; we attribute and share alike.
* Open Terms Archive datasets remain publicly available under their per-collection licenses.
* LLM API access remains available at costs manageable for a student project, which our analyze-once-and-cache architecture is specifically designed to keep low.
* A majority of target sites expose policy text in a form that can be extracted programmatically. This assumption is tested in week one rather than assumed.

# 5. Goals & SMART Objectives

**Primary Goal**

Build a working, publicly usable system that produces trustworthy, evidence-backed ratings of website data practices at a scale human curation cannot reach, and demonstrate its accuracy quantitatively rather than asserting it.

**SMART Objectives**

1. **Extraction reliability.** By the end of week 2, successfully locate and extract clean policy text from at least 16 of 20 randomly selected websites spanning large, medium, and small services. Measured by manual verification of extracted text against the source page.
2. **Classifier performance.** By the end of week 4, report per-category precision, recall, and F1 for a first policy segment classifier on a held-out OPP-115 split; by the end of week 10, deploy a classifier in the live pipeline achieving a macro-averaged F1 of at least 0.70 across the ten OPP-115 practice categories, reported alongside published baselines from the Polisis literature. The week 4 checkpoint exists so that a shortfall surfaces while there is still time to change approach.
3. **Coverage and validation.** By the end of week 12, have analyzed and cached at least 500 services, seeded from the ToS;DR public service catalogue and supplemented by user requests, and report our per-check agreement rate against every service that ToS;DR has comprehensively graded, with disagreements manually classified as our error, their staleness, or genuine ambiguity.

**Success Criteria**

* Extraction success rate on the random sample meets or exceeds 80%
* Classifier macro F1 at or above 0.70 on held-out data, with a per-category confusion matrix reported
* Quote verification rate (findings whose returned quote is confirmed present in source text) at or above 95%
* Run-to-run consistency: with extraction pinned to temperature 0 and a fixed prompt and rubric version, repeated analysis of an identical document produces identical findings at or above 90% agreement across three runs on a 50-document sample
* At least 500 services analyzed, cached, and browsable
* Change detection, running daily across the full tracked set, correctly identifies every change we can confirm by manual inspection in a 30-document audit sample, with no more than one false positive per 100 document-checks

# 6. Deliverables & Milestones

**Key Deliverables**

* Source code, open source, in a public repository
* Trained classifier model with training and evaluation notebooks
* Public website with scorecards, search, request queue, and change feed
* Browser extension package
* Public read API with documentation
* Evaluation report containing all accuracy measurements
* Rubric specification document, versioned
* Competitive and literature review document
* Final presentation and STAR write-up

**Timeline & Milestones**

The classifier runs as a parallel track beginning in week 1 rather than waiting on
the pipeline. OPP-115 is a static annotated corpus, so training and evaluation
share no dependency with document discovery, and the two highest-uncertainty
components can therefore be de-risked simultaneously.

| Weeks | Pipeline track | ML track (parallel) | Milestone |
|---|---|---|---|
| 1–2 | Extraction spike | Corpus preparation, splits, classical baseline | Go/no-go on document discovery; 20-site test complete; fallback confirmed if needed |
| 3–4 | Normalization, version hashing, storage | First trained classifier, per-category metrics reported | Feasibility of both hardest components known by week 4 |
| 5–6 | Vertical slice: fetch → extract → verify → score → scorecard | Model iteration against the week-4 baseline | One service end to end; rubric v1 frozen |
| 7–10 | Scale to 500 services; ToS;DR ingest; request queue | Classifier deployed into the live pipeline; final tuning | Target macro F1 met or fallback approach chosen and justified |
| 11–13 | Daily diff loop, change feed, staleness flags, browser extension | Evaluation harness and accuracy measurements | Monitoring live; extension shipped |
| 14–15 | Polish and delivery | Accuracy report finalized | Final presentation and STAR write-up |

**Module Ownership**

| Module | Owner |
|---|---|
| Discovery, fetch, normalization, version hashing | Jaiden Searle |
| Segment classifier and evaluation harness | Gage Gunn |
| LLM extraction and quote verification | Gage Gunn, Alex Kimoni |
| Deterministic scorer and rubric specification | Sam Holton |
| Website and public read API | Sam Holton |
| Browser extension | Alex Kimoni |
| Monitoring, change feed, staleness detection | Jaiden Searle |

Owners are responsible for implementation, tests, and documentation of their
module, and every member participates in code review across module boundaries.

**Demonstrations**

* Week 2: extraction spike results presented to instructor as the feasibility gate
* Week 4: classifier baseline metrics, the second feasibility gate
* Week 6: vertical slice demo, one service scored end to end with evidence displayed
* Week 10: deployed classifier metrics and scaled coverage review
* Week 13: monitoring and change detection demo
* Week 15: final presentation, including live analysis of an audience-selected website

# 7. Risks & Mitigation

**Technical/Resource Risks**

1. **Document discovery failure (highest).** Policies are buried behind inconsistent links, rendered by JavaScript, split across multiple pages, or embedded within unrelated legal pages. If extraction fails, every downstream component analyzes garbage.
2. **Extraction errors producing false claims.** An LLM misreading a clause could publish an inaccurate claim about a named company.
3. **Classifier underperformance.** OPP-115 is modest in size and its category boundaries are not always crisp, which may cap achievable F1.
4. **Cost overrun on LLM usage.** Analyzing hundreds of documents repeatedly could exceed a student budget.
5. **Scope overrun.** Four modules plus an ML component plus two clients is substantial for one semester.
6. **Upstream dependency changes.** A third-party API or dataset could change terms or availability mid-project.
7. **Degree exception not approved.** The ML component's concurrent credit toward DSML 4360 depends on an approval process outside the team's control, and the classifier scope was sized partly around that requirement.
8. **Disputed findings from named companies.** We publish automated factual claims about identifiable businesses on a public site under a university course. Even an accurate finding can draw a complaint, and an inaccurate one is a reputational problem for the team and the department.

**Mitigation Plan**

1. Isolate discovery as the week-one spike with an explicit numeric gate and a predefined fallback (user-submitted policy URLs plus the request queue), so failure surfaces in week two rather than week twelve.
2. Require a verbatim quote for every finding and programmatically verify that quote exists in the source before accepting it. Low-confidence findings display as "unclear" and score conservatively rather than aggressively. Publish an automated-analysis disclaimer, use factual severity language, and never assert intent.
3. Establish the classifier baseline early against published Polisis figures. If transformer fine-tuning underperforms, fall back to simpler classical approaches and report the comparison honestly, since the comparison itself is a legitimate result.
4. Analyze each document version once and cache centrally; re-analyze only when a content hash changes. Classify segments first so the LLM processes only relevant text rather than whole documents.
5. Build the vertical slice by week 6 so a demonstrable working product exists well before the deadline. Later phases layer on top of a functioning system rather than being required for it. Monitoring, extension, and comparison views are all severable if time compresses.
6. Design ingestion as pluggable adapters so a source change is a swap rather than a rebuild, and cache retrieved third-party data locally rather than depending on live availability during demos.
7. Build the classifier as a required CS deliverable on its own merits, so its value to the project does not depend on the exception being granted. The parallel ML track produces reportable metrics by week 4 regardless of the approval timeline, and the evaluation report stands as a deliverable either way.
8. Publish a visible correction path: every scorecard links to a dispute form, disputed findings are re-reviewed by a team member against the source document within a stated window, and a finding that cannot be substantiated by its quote is withdrawn rather than defended. Display an automated-analysis disclaimer and the analysis date on every scorecard, describe practices in the document's own terms without asserting intent, and keep the full document version history so any published claim can be traced to the exact text that produced it.

# References

* Harkous, H., Fawaz, K., Lebret, R., Schaub, F., Shin, K. G., and Aberer, K. "Polisis: Automated Analysis and Presentation of Privacy Policies Using Deep Learning." USENIX Security Symposium, 2018.
* Wilson, S., et al. "The Creation and Analysis of a Website Privacy Policy Corpus." Association for Computational Linguistics, 2016. Source of the OPP-115 corpus.
* Terms of Service; Didn't Read. Public service catalogue and API, licensed CC BY-SA 3.0.
* PrivacySpy. Open-source rubric-based privacy policy rating project.
* Open Terms Archive. Public datasets of tracked policy document versions.
* Consumer Reports. Permission Slip data-rights application, discontinued 2026.

A fuller competitive and literature review, covering all twelve prior efforts
surveyed, is a separate deliverable listed above.
