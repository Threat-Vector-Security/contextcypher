# Getting Started with the GRC Module

This guide walks you through the Governance, Risk, and Compliance (GRC) module in ContextCypher — a built-in workspace for managing security risks, tracking compliance, running assessments, and driving continuous improvement alongside your architecture diagrams.

---

## What Is the GRC Module?

The GRC module turns ContextCypher from a diagramming tool into a full security operations workspace. It lets you:

- Register and classify assets from your architecture diagram.
- Identify and score security risks using a structured tier taxonomy.
- Map risks against control frameworks like NIST 800-53, MITRE ATT&CK, and the Australian ISM.
- Run scoped assessments with formal risk management plans.
- Track governance documents, third-party vendors, security initiatives, and implemented controls.
- Generate reports, custom charts, and CSV data exports.

Everything is saved in the same workspace file as your diagram — no external database or cloud service needed.

---

## Switching Between Diagram and GRC

At any time, you can switch between the two modes:

1. **Diagram → GRC**: Click the **GRC** button in the diagram editor's top toolbar.
2. **GRC → Diagram**: Click the **Diagram** button in the GRC top bar.

Your data is preserved in both directions. The diagram stays in memory while you work in GRC, and vice versa. Saving from either mode saves everything.

---

## The GRC Tabs at a Glance

When you enter GRC mode, you'll see a scrollable tab bar across the top. Here's what each tab does:

| Tab | Purpose |
|-----|---------|
| **Dashboard** | KPI metrics, risk distribution, appetite breaches, and health indicators. |
| **Assets** | Register and classify assets. Sync nodes from your diagram. |
| **Findings** | Persistent findings from the rule engine, manual entry, or AI analysis. |
| **Risks** | Risk register with tier taxonomy, scoring, treatment, and threat actor linkage. |
| **Compliance** | Load control frameworks, map controls to risks, track implementation status. |
| **Assessments** | Scoped risk assessments with threat model canvases and attack path imports. |
| **Risk Management Plan** | One plan per assessment with objectives, actions, and task conversion. |
| **Governance** | Registry for policies, procedures, SOPs, and guidelines. |
| **Threat Profiles** | Threat actor registry and scenario documentation with MITRE ATT&CK techniques. |
| **Third Parties** | Vendor and supplier risk management with contract and review tracking. |
| **Initiatives** | Strategic security improvement programs with milestone tracking. |
| **Implemented Controls** | Registry of deployed security mechanisms linked to SoA, risks, and assets. |
| **Reporting** | Metrics, custom chart builder, CSV exports, and assessment report generation. |
| **Workflow & Config** | Configuration, health checks, task board, risk model, and reference documentation. |

---

## Step-by-Step: Your First GRC Workflow

The sections below follow the recommended operating sequence. You can do things in any order, but this flow ensures each step has the data it needs.

### Phase 1 — Set Up Your Foundation

#### 1. Configure Your Risk Model

Go to **Workflow & Config → Risk Model**.

- Set the matrix size (e.g., 5×5 for likelihood × impact).
- Configure your rating bands — these are the labels and colors that appear on risk scores (e.g., Catastrophic, Severe, Major, Moderate, Minor, Negligible).
- Set a global risk appetite threshold — any risk scoring above this value is flagged as an appetite breach.

Presets are available for common 4-level, 5-level, and 6-level models.

#### 2. Author Your Risk Statements

Go to **Workflow & Config → Risk Statements**.

The risk taxonomy uses four tiers:

- **Tier 1** — The enterprise-level risk domain (auto-set, e.g., "Enterprise Risk").
- **Tier 2** — Board-level risk categories. The defaults include six categories such as "Critical System Disruption Risk" and "Data Breach Risk". You can edit these.
- **Tier 3** — Named risk scenarios (e.g., "Ransomware disruption of core services"). You can add these manually or import from CSV/TSV.
- **Tier 4** — Operational evidence. These are auto-generated when you link findings to risks.

This taxonomy drives the dropdown selectors you'll use later when creating risks.

#### 3. Define Risk Appetite Rules (Optional)

Go to **Workflow & Config → Risk Appetite**.

If different parts of your organisation have different risk tolerances, add scoped appetite rules. Each rule overrides the global threshold based on a combination of:

- Asset domain (e.g., OT assets have a lower tolerance).
- Tier 1 risk category.
- Minimum asset criticality level.

The most specific rule wins. If two rules tie on specificity, the lower threshold applies.

---

### Phase 2 — Identify Assets and Threats

#### 4. Build or Update Your Diagram

Switch to **Diagram** mode and build your system architecture. Define:

- Nodes for servers, databases, applications, users, etc.
- Edges for data flows and connections.
- Security zones for trust boundaries.
- Named attack paths (covered in the companion Attack Paths guide).

#### 5. Register Assets

Switch back to **GRC** and open the **Assets** tab.

- Click **Sync from Diagram** to automatically pull nodes from your active diagram into the asset register.
- For each asset, set the **domain** (IT, OT, Cloud, Application, etc.), **category**, and **business/security criticality** ratings.
- These classifications drive dashboard metrics, appetite rule matching, and assessment scope filters.

The linked-risks column shows how many risks reference each asset, colour-coded by count.

#### 6. Capture Findings

Open the **Findings** tab.

- Click **Sync from Rule Engine** to import deterministic findings from the diagram's analysis engine. These cover DFD integrity checks, trust boundary rules, data protection rules, and STRIDE coverage.
- Alternatively, create manual findings using the inline form — set a title, description, type (threat, vulnerability, weakness, observation), and severity.
- Each finding can be linked to risks and tasks later.

#### 7. Document Threat Profiles

Open the **Threat Profiles** tab.

**Threat Actors** — Register the adversaries relevant to your system:
- Set the actor type (nation state, organised crime, insider, hacktivist, etc.).
- Rate their capability (1–5) and resource level.
- Describe their motivation and link them to targeted assets.

**Threat Scenarios** — Document how those actors might attack:
- Link a scenario to an actor.
- Add MITRE ATT&CK technique tags.
- Link to the risks the scenario would realise.

---

### Phase 3 — Assess and Score Risks

#### 8. Create Risks

Open the **Risks** tab.

- Use the creation form at the top to quick-create a risk. Toggle between **Tier 2** (board-level) and **Tier 3** (named scenario) and enter a title.
- New risks are assigned default mid-range scores. Expand the row to refine:
  - **Tier classification** — Select Tier 2 and Tier 3 categories from the dropdowns.
  - **Likelihood and Impact** — Adjust using inline dropdowns. The inherent score recalculates automatically.
  - **Treatment strategy** — Mitigate, Transfer, Avoid, or Accept.
  - **Owner and next review date** — Assign accountability.
  - **Linked assets** — Connect to assets from the register.
  - **Threat actor** — Optionally attribute the risk to a threat actor.

Use the filter bar to view risks by status, treatment strategy, or search text.

To create a **Tier 4** risk from a finding, go to the **Findings** tab and click the **Create Risk** button on a finding. This auto-links the finding as operational evidence.

#### 9. Create Assessments

Open the **Assessments** tab.

The assessment creation flow has four sections:

1. **Details** — Name, description, status, owner.
2. **Scope** — Add scope items (system, diagram, application, OSI layer, etc.) to define what's being assessed.
3. **Tier Filters** — Optionally narrow the assessment to specific Tier 2/3/4 categories.
4. **Link Risks** — Select which risks fall within this assessment's scope. The system suggests risks based on your scope and tier filter selections.

Once created, expand the assessment to access its workspace:
- **Details & Ownership** — Edit assessment metadata and status.
- **Scope & Filters** — Review and adjust scope items and tier filter criteria.
- **Findings & Evidence** — View findings linked through the assessment's risks and tier filter.
- **Threat Model & Attack Paths** — Import nodes from the diagram, toggle edges into an attack path, or import named attack paths (see the companion Attack Paths guide).
- **Linkages** — Connect to implemented controls that mitigate risks within the assessment scope, and link to security initiatives that justify risk acceptance or strategic treatment decisions. Each linkage is a multi-select dropdown with clickable chips that navigate to the linked entity.
- **Export** — Generate reports in PDF, HTML, or plain text.

#### 10. Write Risk Management Plans

Open the **Risk Management Plan** tab.

Each assessment can have one risk management plan (SRMP). Select an assessment from the dropdown, then fill in:

- **Objective** — What the plan aims to achieve.
- **Strategy** — How risks will be treated.
- **Residual risk statement** — What risk remains after treatment.
- **Monitoring** — How you will track treatment effectiveness.
- **Communication** — How stakeholders will be informed.
- **Review cadence** — When the plan will next be reviewed.
- **Action register** — Specific actions with owners, due dates, statuses, linked risks, and notes.

Plan actions can be converted into workflow tasks with one click.

---

### Phase 4 — Control, Govern, and Improve

#### 11. Load Compliance Frameworks

Open the **Compliance** tab.

Click **Add Framework** to browse the built-in catalog:

- **NIST SP 800-53 Rev 5.1** (1,189 controls — with family-level selective loading and "Base Controls Only" toggle)
- **OWASP Top 10 2021** (10 controls)
- **CSA CCM v4.0.10** (197 controls)
- **MITRE ATT&CK Enterprise/ICS/Mobile v14.1**
- **IEC 62443-3-3** (92 controls)
- **Australian ISM Dec 2025** (1,073 controls)
- **Essential Eight Oct 2024** (126 controls)
- And more.

You can also import control sets from CSV or XLSX.

For each control in the Statement of Applicability (SoA):
- Set **applicability** and **implementation status**.
- Link to **risks** it mitigates.
- Add **justification** text and **evidence references**.

The tabbed view shows per-framework progress indicators (e.g., "NIST CSF 12/45").

#### 12. Register Implemented Controls

Open the **Implemented Controls** tab.

This is where you document the actual security mechanisms deployed across your environment — the technologies, tools, policies, and processes that protect your systems. While the Compliance tab tracks what controls your frameworks require (the "should"), the Implemented Controls tab tracks what you actually have in place (the "is").

**Creating a control:**

Click **Add Control** to reveal the inline creation form. Fill in:
- **Title** — A descriptive name (e.g., "Web Application Firewall — AWS WAF", "Multi-Factor Authentication — Okta").
- **Type** — Technical, Administrative, Physical, or Operational.
- **Category** — Choose from 13 categories: Access Control, Network Security, Endpoint Protection, Data Protection, Identity Management, Monitoring/Logging, Incident Response, Vulnerability Management, Encryption, Backup & Recovery, Physical Security, Policy/Procedure, or Training & Awareness.
- **Status** — Planned, Active, Under Review, Deprecated, or Inactive.
- **Automation Level** — Manual, Semi-Automated, or Fully Automated.
- **Owner** — The person or team responsible for this control.

**The controls table:**

Once created, controls appear in a sortable, filterable table with configurable columns. You can:
- **Sort** by any column header (title, type, category, status, automation, owner, vendor/product, SoA links, risks).
- **Filter** by type (Technical/Administrative/Physical/Operational), status (Active/Planned/Under Review/Deprecated/Inactive), and category (all 13 categories) using chip selectors.
- **Search** across title, description, owner, vendor, product, and notes.
- **Configure columns** using the gear icon to show or hide columns and reorder them.

**Expanded detail row:**

Click any control row to expand it. The detail view provides:

- **Description** — Full narrative of what this control does and how it works.
- **Control Type and Category** — Editable dropdowns to reclassify.
- **Status and Automation Level** — Editable dropdowns to update.
- **Owner** — Editable text field.
- **Vendor, Product, and Version** — Track the specific technology (e.g., Vendor: "CrowdStrike", Product: "Falcon", Version: "6.45").
- **Implemented Date** — When the control was deployed.
- **Last Review Date** — When it was last assessed for effectiveness.
- **Next Review Date** — When the next review is due. Controls past their review date are highlighted as overdue and generate workflow health alerts.
- **Linked SoA Entries** — Multi-select to connect this control to the Statement of Applicability entries it satisfies. Clickable chips navigate to the Compliance tab.
- **Linked Risks** — Multi-select to connect to risks this control mitigates. Clickable chips navigate to the Risks tab.
- **Linked Assets** — Multi-select to connect to assets this control protects. Clickable chips navigate to the Assets tab.
- **Linked Assessments** — Multi-select to connect to assessments that evaluate this control's effectiveness. Clickable chips navigate to the Assessments tab.
- **Notes** — Free-text internal notes.

**Deletion:**

Click the delete icon on any row. A confirmation dialog warns that the control record will be removed and unlinked from any security initiatives that reference it.

**How implemented controls connect to other GRC entities:**

- **SoA entries** — Link a control to the SoA entries it satisfies. This shows which framework requirements are covered by real deployments.
- **Risks** — Link a control to the risks it mitigates. This creates a treatment evidence trail.
- **Assets** — Link a control to the assets it protects. This shows which assets are defended.
- **Assessments** — Link a control to assessments that evaluate it. Assessments can also link back to controls from their Linkages section.
- **Security Initiatives** — Initiatives can link to implemented controls. If you delete a control, its references are automatically cleaned from any linked initiatives.
- **Workflow health** — Controls without evidence and controls overdue for review are flagged in the Workflow & Health section.
- **Dashboard** — The dashboard shows total implemented control count, active control count, and overdue-for-review count.

#### 13. Manage Governance Documents

Open the **Governance** tab.

Register your policies, procedures, SOPs, and guidelines:

- Add metadata: title, type, description, owner, version, review dates, status, and tags.
- Link to an external URL (SharePoint, file share, etc.) — click the link to open the document.
- Cross-link to risks, control sets, and assessments.
- Track review status — overdue reviews generate workflow health alerts.

Filter documents by type, status, and text search. All fields are inline-editable.

#### 14. Track Third-Party Risk

Open the **Third Parties** tab.

Register vendors and suppliers with:
- **Category** (cloud provider, SaaS, managed service, contractor, supplier, partner, other).
- **Status** (active, under review, onboarding, offboarding, terminated).
- **Risk rating** (critical, high, medium, low, not assessed).
- **Data classification** (public, internal, confidential, restricted).
- **Contact details** — Name and email.
- **Contract expiry** and **next review date**.
- **Linked assets** and **linked risks** via multi-select with clickable chips.

The table supports configurable columns, sortable headers, expandable detail rows with a two-column grid, category and status chip filters, and text search across name, description, contact, and notes.

Overdue reviews appear in workflow health and the dashboard. The dashboard shows total third-party count and high/critical risk count.

#### 15. Plan Security Initiatives

Open the **Initiatives** tab.

Security initiatives track your strategic security improvement programs — uplift projects, remediation campaigns, compliance transformations, hardening efforts, and more. They tie your operational work (risks, controls, assets) to your strategic goals.

**Creating an initiative:**

Click **Add Initiative** to reveal the inline creation form. Fill in:
- **Title** — A descriptive name (e.g., "Zero Trust Network Uplift", "PCI-DSS Compliance Remediation", "Legacy System Hardening Program").
- **Category** — Uplift, Remediation, Compliance, Transformation, Hardening, or Other.
- **Priority** — Critical, High, Medium, or Low.
- **Owner** — The person or team driving this initiative.

New initiatives start with a status of "Proposed".

**The initiatives table:**

Once created, initiatives appear in a sortable, filterable table with configurable columns:
- **Title** — Inline-editable.
- **Category** — Colour-coded chip (blue for Uplift, red for Remediation, purple for Compliance, green for Transformation, gold for Hardening).
- **Status** — Colour-coded chip showing where the initiative is in its lifecycle.
- **Priority** — Colour-coded chip (red for Critical, orange for High, gold for Medium, green for Low).
- **Owner** — Who is responsible.
- **Target Date** — When the initiative should be completed.
- **Progress** — A progress bar with percentage, calculated automatically from completed milestones.
- **Linked Risks** — Clickable chips showing the first three linked risks, with a count for any additional.

You can:
- **Sort** by any column header.
- **Filter** by category chips (Uplift, Remediation, Compliance, Transformation, Hardening, Other) and status chips (Proposed, Approved, In Progress, On Hold, Completed, Cancelled).
- **Search** across title, description, owner, current state, and target state.
- **Configure columns** using the gear icon.

**Status lifecycle:**

Initiatives follow a defined lifecycle: **Proposed → Approved → In Progress → On Hold → Completed** (or **Cancelled**). Update the status in the expanded detail to reflect the initiative's current phase.

**Expanded detail row:**

Click any initiative row to expand it. The detail view provides:

- **Description** — What the initiative is about.
- **Current State** — A narrative describing the existing security posture or gap that this initiative addresses (e.g., "Legacy applications use password-only authentication. No centralised identity provider. VPN access uses shared credentials.").
- **Target State** — A narrative describing the desired future security posture (e.g., "All applications integrated with SSO via Okta. MFA enforced on all user and admin accounts. Certificate-based VPN authentication deployed.").
- **Category, Status, and Priority** — Editable dropdowns.
- **Owner and Executive Sponsor** — Track both the operational owner and the executive champion.
- **Start Date, Target Date, and Completed Date** — Timeline tracking.

**Linkages:**

The expanded detail includes five multi-select linkage fields, each displaying clickable chips that navigate to the linked entity:

- **Linked Risks** — Risks that this initiative addresses. Chips navigate to the Risks tab.
- **Linked Control Sets** — Compliance frameworks driving this initiative. Chips navigate to the Compliance tab.
- **Linked Assets** — Assets that will benefit from this initiative. Chips navigate to the Assets tab.
- **Linked Implemented Controls** — Deployed controls that support or result from this initiative. Chips navigate to the Implemented Controls tab.
- **Linked Assessments** — Assessments that evaluate the scope this initiative covers. Chips navigate to the Assessments tab.

**Milestone management:**

Within each initiative's expanded detail, a milestones sub-table tracks the specific deliverables:

- Click **Add Milestone** to create a new row.
- Each milestone has:
  - **Title** — What needs to be delivered (inline-editable).
  - **Status** — Pending, In Progress, Completed, or Skipped (colour-coded dropdown). Setting a milestone to "Completed" auto-fills the completed date.
  - **Due Date** — When this milestone is due (date picker).
  - **Owner** — Who is responsible for this deliverable (inline-editable).
- Delete milestones with the trash icon.
- The milestone counter shows completed vs. total (e.g., "3/7 completed").
- The **progress bar** in the table column is calculated automatically: completed milestones / total milestones × 100%.

**Deletion:**

Click the delete icon on any row. A confirmation dialog warns that this action cannot be undone.

**How initiatives connect to other GRC entities:**

- **Risks** — Link to the risks the initiative is designed to treat. This connects strategic programs to specific risk items.
- **Control sets** — Link to compliance frameworks that require this initiative (e.g., a PCI-DSS remediation initiative linked to the PCI framework).
- **Assets** — Link to assets that will benefit from the initiative's outcomes.
- **Implemented controls** — Link to controls being deployed as part of the initiative, or existing controls the initiative strengthens.
- **Assessments** — Link to assessments that cover the initiative's scope. Assessments can also link back to initiatives from their Linkages section to reference initiatives that justify risk acceptance or strategic treatment.
- **Workflow health** — Stalled initiatives (status is "In Progress" but no milestones have been completed) and overdue milestones are flagged in the Workflow & Health section.
- **Dashboard** — The dashboard shows total initiative count, active initiative count, and overdue initiative count.

---

### Phase 5 — Monitor and Report

#### 16. Manage Workflow Tasks

Go to **Workflow & Config → Task Board**.

Tasks come from three sources:
- **Auto-generated gap tasks** — The system identifies gaps and creates tasks automatically:
  - High/critical risks without SoA mitigations.
  - Implemented controls without evidence.
  - Risks exceeding their resolved appetite threshold (escalation tasks).
  - Governance documents past their next review date (review tasks).
  - Third parties overdue for review.
  - Implemented controls overdue for review.
- **Plan action conversion** — Convert SRMP actions into tasks.
- **Manual creation** — Create tasks with optional links to risks, assessments, assets, and control set/control pairs.

Each task has a type, priority, owner, due date, status, and optional linkage fields. The link preview shows what entities will be connected before you create the task.

Filter tasks by status, priority, type, and text search with a clear-all option. Inline editing is available for all task fields.

#### 17. Check the Dashboard

The **Dashboard** tab provides a comprehensive operational overview:

- **Asset metrics** — Total count, domain distribution, high business-critical and high security-critical asset counts.
- **Risk metrics** — Total count, highest-severity risk count, risk distribution.
- **Appetite breach metrics** — Count of risks exceeding their resolved appetite threshold, highlighted in red when greater than zero.
- **Findings metrics** — Total count, open count, critical/high count.
- **SoA coverage** — Implementation progress across loaded frameworks.
- **Implemented control metrics** — Total count, active count, and overdue-for-review count.
- **Task metrics** — Total count, active count, overdue count.
- **SRMP metrics** — Assessments with plans, open plan action counts.
- **Governance metrics** — Total document count, active document count.
- **Threat profile metrics** — Actor count, scenario count.
- **Third-party metrics** — Total count, high/critical risk count.
- **Security initiative metrics** — Total count, active count, overdue count.

#### 18. Build Reports

Open the **Reporting** tab.

- **Metrics Snapshot** — 12 KPI cards at a glance covering assets, risks, findings, SoA, implemented controls, tasks, appetite breaches, assessment coverage, and governance documents.
- **Custom Chart Builder** — Create up to 20 charts from any GRC data source. Choose from 9 chart types (bar, horizontal bar, pie, donut, stacked bar, line, area, radar, treemap), 11 data sources (risks, assets, findings, tasks, third parties, governance docs, threat actors, SoA entries, assessments, threat scenarios, appetite rules), and 5 colour schemes (default, severity, cool, warm, monochrome). Time-bucketed line and area charts support week/month/quarter granularity. Stacked bars use primary and secondary group-by fields. Charts are rendered inline in a responsive 3-column grid.
- **Built-in Analytics** — 10 pre-configured charts covering risk rating distribution, risk status, asset domains, finding severity, finding status, task status and priority, control implementation, third-party risk ratings, governance document status, and threat actor types.
- **Framework Coverage** — Per-framework progress bars with implementation and applicability chip breakdowns.
- **Report Catalog** — 8 report templates with configurable section visibility, ordering, reset, preview, and HTML download.
- **CSV Exports** — Download data for assets, risks, SoA, tasks, plans, threat profiles, appetite rules, governance docs, findings, third parties, initiatives, and implemented controls.

---

## Using the AI Analysis Panel

The AI chat panel is available on every GRC tab. On wide screens it docks to the right; on narrow screens it's a toggleable overlay.

The panel uses the same AI providers as diagram mode (Ollama, OpenAI, Claude, Gemini) and includes:
- Full diagram context from your architecture.
- Optional GRC workspace context — configurable in **Workflow & Config → Defaults & Display → AI Assist**.

You can control:
- Whether GRC context is included in prompts.
- The scope: linked-to-active-diagram vs. full workspace.
- The detail level: summary vs. detailed.
- Per-section toggles for which GRC data to include (assets, risks, SoA, tasks, assessments, threat profiles, governance documents, appetite rules, findings, third parties, security initiatives, implemented controls).
- Maximum items per section (bounded for prompt-size control).

---

## Workflow Health at a Glance

Go to **Workflow & Config → Workflow & Health** for a live health check:

- Orphan risks (no linked assets or diagram nodes).
- Unmitigated high/critical risks.
- Appetite breaches (risks exceeding resolved appetite threshold).
- Controls without risk links.
- Implemented controls missing evidence.
- Assessment coverage percentage.
- Overdue/due-soon tasks.
- Governance documents overdue for review.
- Third parties overdue for review.
- Stalled security initiatives (in progress with no milestone progress).
- Overdue initiative milestones.
- Implemented controls overdue for review.

Each indicator has a badge count and recommended next actions are generated from the current state. A live risk matrix preview reflects the active model with global and scoped appetite threshold awareness.

---

## The Technical Reference

For a detailed look at every entity type, field, status lifecycle, scoring model, deletion behaviour, and API endpoint, visit **Workflow & Config → Technical Reference**. This in-app reference covers 11 sections:

1. **Entity Types** — All 15 GRC entity types with purpose and key fields.
2. **Entity Relationships** — Full linkage map showing how every entity connects to every other.
3. **Tier Taxonomy Model** — Four-tier hierarchy with editability rules and defaults.
4. **Status Lifecycles** — Status values and progression flows for all 10 stateful entity types.
5. **Risk Scoring Model** — Likelihood × impact matrix, rating bands, appetite thresholds, and rescoring.
6. **Deletion Behaviour** — Referential integrity cleanup matrix.
7. **Assessment Model** — Scope items, tier filters, threat model canvas, attack paths, and SRMP.
8. **Persistence & Export** — Single-file save model and CSV export inventory.
9. **Backend API Surface** — All /api/grc endpoints with descriptions.
10. **Diagram Integration Points** — Eight integration mechanisms between Diagram and GRC.
11. **Configuration Options** — All configurable settings grouped by area.

Live workspace entity counts are displayed as chips at the top.

---

## How Everything Links Together

The GRC module's power comes from its entity relationships. Here's a simplified view of the traceability chain:

```
Diagram (nodes, edges, attack paths, security zones)
    │
    ├──▶ Assets (synced from diagram nodes)
    │       ├──▶ Risks, Threat Actors, Third Parties
    │       ├──▶ Implemented Controls, Initiatives
    │
    ├──▶ Findings (synced from rule engine or manual)
    │       ├──▶ Risks (finding-to-risk linkage)
    │       └──▶ Tasks (finding-to-task linkage)
    │
    └──▶ Attack Paths (imported into assessments)

Risks ──▶ SoA Entries ──▶ Implemented Controls
  │                              │
  ├──▶ Assessments ◀─────────────┘
  │       │
  │       ├──▶ SRMP + Actions ──▶ Workflow Tasks
  │       └──▶ Security Initiatives
  │
  ├──▶ Threat Scenarios
  ├──▶ Governance Documents
  └──▶ Appetite Rules (scoped threshold matching)

Security Initiatives ──▶ Risks, Control Sets, Assets,
                         Implemented Controls, Assessments
                         └──▶ Milestones (progress tracking)
```

When you delete an entity, stale references are automatically cleaned from linked entities. For example, deleting a risk removes its ID from SoA entries, assessments, SRMP actions, tasks, threat scenarios, governance documents, and finding linkages.

---

## Tips for Getting the Most Out of GRC

1. **Start with the diagram.** A well-structured architecture diagram with security zones gives your GRC workspace a strong foundation of assets and findings.
2. **Use the tier taxonomy.** Structuring risks by tier makes reporting clearer and helps assessments focus on the right level of detail.
3. **Link everything.** The power of the GRC module comes from traceability — assets → risks → controls → assessments → tasks → initiatives. When everything is linked, gap analysis and reporting work automatically.
4. **Track both framework controls and implemented controls.** Use the Compliance tab for what your frameworks require, and the Implemented Controls tab for what you actually have deployed. Linking them together shows where you're covered and where you have gaps.
5. **Use initiatives to connect strategy to operations.** Link initiatives to the risks they treat, the controls they deploy, the assets they protect, and the assessments that evaluate them. Milestones give your leadership a clear progress story.
6. **Check workflow health regularly.** The health indicators surface operational gaps — stalled initiatives, overdue control reviews, appetite breaches, orphan risks — before they become audit findings.
7. **Build custom charts.** The chart builder lets you create exactly the visualisations your stakeholders need, from any GRC data source.
8. **Save often.** Everything lives in one workspace file. Use Save As to create checkpoints before major changes.
