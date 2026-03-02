# Attack Paths and Manual Threat Modeling

This guide covers the non-AI analysis layer in ContextCypher — the deterministic rule engine, the visual overlay, the manual findings workbench, and the attack paths system. It also explains how named attack paths flow from the diagram into GRC assessments for formal risk documentation, and how those assessments connect to implemented controls and security initiatives for end-to-end traceability.

No AI is required. Everything in this guide runs locally and deterministically.

---

## What Is the Manual Analysis Layer?

ContextCypher includes a complete threat modeling toolkit that works without any AI provider. It gives you:

- A **rule engine** that runs deterministic checks against your diagram (DFD integrity, trust boundaries, data protection, STRIDE coverage, OWASP Top 10).
- A **visual overlay** that highlights flagged nodes, edges, and zones directly on the canvas.
- A **Manual Findings Workbench** for reviewing findings, working through the STRIDE matrix, and tracking methodology progress.
- An **Attack Paths Panel** for defining named attack paths with STRIDE and PASTA methodology support.
- **GRC integration** that lets you import attack paths into formal assessments and connect them to risks, implemented controls, and security initiatives.

---

## The Visual Overlay

When you open a diagram, the analysis overlay is active by default. The rule engine runs automatically (debounced) whenever you:

- Add, remove, or update a node or edge.
- Change zone boundaries or classifications.
- Edit metadata in the node or edge editors.

Flagged elements appear with highlighted styling on the canvas:

- **Nodes** get a flagged visual style.
- **Zones** show a dashed border when a rule is potentially violated.

Hovering over a flagged element shows a short rule summary and an **Open Manual Findings** action.

---

## What the Rules Check

The rule engine evaluates your diagram against several categories of security rules. Here's a summary of what each category covers.

### DFD Integrity (Rules DFD-001 through DFD-006)
These enforce basic data flow diagram correctness:
- External entities shouldn't connect directly to data stores (they need a process in between).
- Data flows must have labels.
- Processes must have at least one input and one output.
- Data stores must connect to at least one process.
- Isolated or unconnected nodes are flagged.
- Missing type annotations on DFD elements are flagged.

### Trust Boundary (Rules TB-001 through TB-004)
These check that security zones are properly defined and that cross-zone flows are protected:
- Flows crossing zone boundaries must specify protocol and encryption.
- Flows from lower-trust to higher-trust zones must require authentication.
- Trust boundaries need a type definition.
- Zones containing sensitive data need a classification.

### Data Protection (Rules DP-001 through DP-003)
- Sensitive data in transit without encryption.
- Sensitive data at rest without encryption controls.
- PII/PHI/PCI flows without logging or monitoring.

### Identity and Access (Rules IA-001 through IA-003)
- External ingress to internal zones without authentication.
- Admin interfaces reachable from external zones.
- Privileged components without MFA.

### Availability and Resilience (Rules AR-001, AR-002, AR-EDGE-001)
- Single points of failure (nodes with many connections).
- Critical flows missing redundancy.
- Critical zones without noted redundancy controls.

### Observability (Rules OB-001, OB-002)
- Sensitive data flows without logging controls.
- Security monitoring nodes not connected to monitored components.

### OWASP Top 10 2021 (Rules A01 through A10)
A dedicated set of checks mapped to each OWASP category — from broken access control (A01) through SSRF (A10).

### STRIDE Coverage (Rules S01 through S06)
Explicit checks for each STRIDE category:
- **Spoofing** — Missing authentication on trust boundary crossings.
- **Tampering** — Sensitive data without integrity or encryption controls.
- **Repudiation** — Missing logging or audit controls.
- **Information Disclosure** — Unclassified or unencrypted sensitive data.
- **Denial of Service** — Single points of failure, missing traffic protections.
- **Elevation of Privilege** — Missing authorization controls on privileged components.

### Node-Type Contextual Hints (CTX-* Rules)

Every non-structural node also receives one contextual STRIDE hint based on its component type. For example:

- A **database** node gets a hint about Tampering, Information Disclosure, Elevation of Privilege, and Repudiation — because databases inherently face those threat categories.
- An **API gateway** gets a hint about Spoofing, Elevation of Privilege, and DoS.
- A **message queue** gets a hint about Spoofing, Tampering, Repudiation, and DoS.

These hints aren't policy violations — they're advisory prompts telling you which STRIDE categories deserve focused attention for that component type. The full list covers 25+ node types including storage, web servers, firewalls, load balancers, identity providers, CI/CD pipelines, OT components (PLCs, RTUs, SCADA), AI models, and endpoints.

---

## The Manual Findings Workbench

Click the **Manual Findings** button in the diagram header to open the full-screen workbench. It has four tabs.

### Tab 1: Findings

This is where you review all findings from the rule engine.

- Findings are grouped by the element they relate to (node, edge, or zone). Use the tabs at the top or the autocomplete search bar to jump to a specific element.
- Each finding shows:
  - **Rule ID and category** (e.g., "TB-001 — Trust Boundary").
  - **Description** of the issue.
  - **STRIDE categories** as colour-coded chips.
  - **Mitigation status selector** — Not Addressed, In Progress, Mitigated, Accepted, or Transferred.
  - **Mitigation notes** — Free text to explain your response.
  - **Rule explanation** — Why it matters, how to fix it, and references to OWASP and STRIDE standards.
  - **Diagram context** — Shows the connection information (source → target) for edge findings.

Each finding has a **Focus Node** or **Focus Edge** button that navigates the diagram canvas to the affected element.

### Tab 2: STRIDE Matrix

A grid view of all elements (rows) against the six STRIDE categories (columns).

- Click any STRIDE chip in the guidance bar at the top to expand detailed guidance: description, DFD applicability, questions to ask, attack examples (in red), key mitigations (in green), and OWASP mappings.
- Each cell in the matrix shows whether that STRIDE category applies to that element, how many findings exist, and lets you set an override (Applicable, N/A, Mitigated, Accepted).
- A progress summary at the bottom shows assessed cells vs. applicable cells with a completion percentage.

This is your systematic way to ensure you've considered every STRIDE category for every element.

### Tab 3: Attack Paths

Lists all named attack paths defined in the diagram (more on creating these below). Each path card shows the STRIDE chip, risk level, name, and step count. Expand a path to see the ordered step sequence with Focus Edge buttons and related threat findings.

### Tab 4: Methodology

Tracks your progress through two complementary methodologies:

**STRIDE 4-Step Progress** — Four phases (Diagram, Identify, Mitigate, Validate), each with a percentage progress bar showing how far along you are.

**PASTA 7-Step Guide** — Each of the seven PASTA stages is a collapsible card showing:
- Stage description.
- Practical guidance.
- Questions to ask.
- Expected outputs.

The methodology tab helps you ensure thoroughness — even without AI, you can follow a structured, repeatable process.

### Exporting

The workbench supports export to text and HTML. The export includes all findings with context, the STRIDE matrix summary, attack path list with steps, methodology progress, the rule catalog, and threat pattern mappings.

---

## Creating Attack Paths

Attack paths are the core of structured threat modeling. They let you trace how an attacker could move through your system from an entry point to a target.

### Where to Find the Attack Paths Panel

In diagram mode, open the left sidebar and select the **Attack Paths** tab. The panel shows a summary header with total path count and critical/high badge counts.

### Creating a New Path

1. Click **New Path**.
2. Enter a **path name** (e.g., "External attacker to customer database").
3. Select a **STRIDE category** — this classifies the primary threat the path represents. Click the **?** icon to see guidance for that category.
4. Select a **risk level** (Critical, High, Medium, Low, Info).
5. The path appears as a collapsible card.

### Building the Path on the Canvas

1. Expand the path card and click **Build Path**.
2. The canvas enters edge-click mode — edges highlight as candidates.
3. **Click edges** on the diagram to add them to the path. Added edges animate in red.
4. Click an edge again to remove it from the path.
5. Click **Done** when finished.

The panel shows the ordered sequence of steps (source → edge → target) as you build. Each step has:
- **Up/down arrows** to reorder.
- A **remove button** to delete the step.
- A **crosshair button** to zoom the diagram to that element.

Use the **Auto-order** button to let the system sort steps by graph traversal (following the source→target chain).

### Adding PASTA Methodology Context

Each path can optionally be assigned a **PASTA stage** (1–7). Click the **?** next to the PASTA dropdown to see guidance for that stage, including questions to ask and expected outputs.

### Adding a Description

Use the description text area to write a narrative of the attack scenario — what the attacker does at each step, what they're trying to achieve, and what conditions must be true for the path to succeed.

### Deleting a Path

Expand the card and click **Delete Path**. This removes the path from the diagram.

---

## STRIDE Guidance in the Panel

The attack paths panel includes a **Methodology Guide** section (collapsible accordion) listing all six STRIDE categories and all seven PASTA stages as clickable rows.

Clicking any STRIDE row opens a guidance popover showing:
- **Description and threat statement** — What this category means.
- **DFD element applicability** — Which element types (Process, Data Store, Data Flow, Actor) are affected.
- **Questions to ask** — Five specific questions to guide your analysis for each element.
- **Attack examples** — Five real-world examples (shown in red).
- **Key mitigations** — Six defences (shown in green).
- **OWASP Top 10 mappings** — Which OWASP categories relate.

Clicking any PASTA row opens stage guidance with a description, practical tip, questions, and expected outputs.

This guidance is available everywhere — on the STRIDE dropdown when creating a path, on every STRIDE chip in path cards, and in the methodology guide section.

---

## How Attack Paths Integrate with GRC Assessments

This is where the diagram-level analysis connects to formal risk documentation. Named attack paths can be imported directly into GRC assessments, bringing the visual threat model into your compliance and risk management workflow.

### The Flow: Diagram → GRC Assessment

```
Diagram Attack Paths Panel
    │
    │  Define paths (STRIDE, risk level, edge steps)
    │
    ▼
DiagramContextSnapshot.attackPaths
    │
    │  Passed to GRC module when switching modes
    │
    ▼
GRC Assessment → Threat Model & Attack Paths workspace
    │
    │  Import dropdown lists all available paths
    │
    ▼
Assessment threat model canvas + AssessmentAttackPath records
    │
    │  Assessment links to risks, controls, and initiatives
    │
    ▼
Full traceability: Diagram path → Risk → SoA control →
    Implemented control → Security initiative
```

### Step-by-Step: Importing an Attack Path into an Assessment

1. **Create your attack paths in the diagram** using the Attack Paths Panel (as described above).

2. **Switch to GRC mode** and open the **Assessments** tab.

3. **Create or open an assessment.** Expand it to access the assessment workspace.

4. **Scroll to the Threat Model & Attack Paths section.** If your active diagram has named attack paths, an **Import Attack Paths** dropdown appears here.

5. **Select a path from the dropdown.** Each entry shows the path name with a STRIDE category chip (colour-coded) and a risk level chip, so you can identify paths at a glance.

6. **Click Import Path.** The system:
   - Creates canvas nodes for each source and target node referenced in the path steps.
   - Creates canvas edges between those nodes.
   - Creates an `AssessmentAttackPath` record with the full metadata (STRIDE category, risk level, ordered steps, and a back-reference to the diagram path ID).

7. **View the imported path.** Below the canvas, all imported paths appear as collapsible cards:
   - **Collapsed header** shows: STRIDE chip, risk level chip, path name, step count, expand chevron.
   - **Expanded card** shows the ordered step list (source → target) with a **Focus Edge** button per step to navigate the mini-canvas.
   - A **Remove Path** button deletes the path from the assessment.

### Re-importing and Updating

If you modify an attack path in the diagram and re-import it into the same assessment, the existing `AssessmentAttackPath` record is **replaced in place** — you don't end up with duplicates.

### Navigating Back to the Diagram

The assessment canvas uses the same icon-only node style as the 2D diagram. You can:

- **Double-click** any linked canvas node or edge to switch back to Diagram mode, which auto-focuses and selects the original element.
- Use the **Focus Edge** buttons in path step lists to navigate within the assessment canvas.

### What the Assessment Canvas Does (and Doesn't Do)

The assessment threat model canvas is a **simplified representation** — it shows the nodes and edges from your diagram that are relevant to the assessment's attack paths and scope. You can:

- Import individual nodes via a dropdown.
- Import zone-based sections (by Security Zone) to pull related nodes and edges in one action.
- Click "Import All" to import every node and edge from the active diagram.
- Toggle edges in and out of the attack path (red animation = in path).
- Write an **Attack Path Description** — a narrative text area for describing the overall attack scenario.

The canvas intentionally **does not** include scoring or heat-map logic. It's a documentation and visualisation tool, not a risk scoring surface. Risk scoring happens in the Risks tab using the configured likelihood × impact matrix.

---

## Connecting Assessments to Implemented Controls

Once you've imported attack paths and linked risks to an assessment, you can connect the assessment to the **implemented controls** that mitigate those threats.

### From the Assessment Workspace

In the assessment's expanded workspace, the **Linkages** section includes a **Linked Implemented Controls** multi-select dropdown. This lets you:

- Select from all implemented controls registered in the Implemented Controls tab.
- See which specific technologies, tools, and processes are deployed to mitigate risks within this assessment's scope.
- Click any control chip to navigate directly to the Implemented Controls tab for that entry.

### From the Implemented Controls Tab

Each implemented control's expanded detail includes a **Linked Assessments** multi-select. This creates the bidirectional link — you can see which assessments evaluate a given control, and which controls protect a given assessment scope.

### Why This Matters for Attack Paths

When you import an attack path into an assessment and link the assessment to implemented controls, you create an evidence chain:

1. The **attack path** shows how an attacker could traverse your system.
2. The **risks** linked to the assessment document the likelihood and impact.
3. The **implemented controls** show what technologies and processes are deployed to block or detect each step in the path.
4. The **SoA entries** linked to those controls show which framework requirements they satisfy.

This chain is included in assessment report exports, giving auditors and stakeholders a clear view from threat to mitigation.

---

## Connecting Assessments to Security Initiatives

Assessments can also link to **security initiatives** — the strategic improvement programs that justify why certain risks are being accepted now (because an initiative is underway to address them) or document the uplift programs that will deploy new controls.

### From the Assessment Workspace

The **Linkages** section includes a **Linked Initiatives** multi-select dropdown. This lets you:

- Select from all security initiatives registered in the Initiatives tab.
- Reference the initiatives that provide strategic context for risk treatment decisions within the assessment scope.
- Click any initiative chip to navigate directly to the Initiatives tab.

### From the Initiatives Tab

Each initiative's expanded detail includes a **Linked Assessments** multi-select. You can see which assessments reference a given initiative, and which initiatives cover a given assessment scope.

### How Initiatives Complete the Picture

Security initiatives bridge the gap between "we know there's a risk" and "here's what we're doing about it":

- An initiative might document a **Zero Trust Network Uplift** program that will deploy new controls over the next 12 months.
- That initiative links to the **risks** it addresses, the **control sets** driving it, the **assets** it protects, and the **implemented controls** being deployed.
- **Milestones** within the initiative track specific deliverables (e.g., "Deploy MFA on all admin accounts", "Migrate to certificate-based VPN") with owners, due dates, and completion status.
- The **progress bar** shows how far along the initiative is, calculated from completed milestones.

When an assessment links to this initiative, it documents that the residual risk from the imported attack paths is being actively treated through a structured improvement program.

---

## Practical Walkthrough: End-to-End Threat Modeling

Here's how all the pieces fit together in a real workflow.

### 1. Diagram Your System

Create an architecture diagram with at least:
- An external actor (e.g., "Web User").
- An entry point (e.g., "API Gateway").
- Internal services (e.g., "Auth Service", "App Server").
- A data store (e.g., "Customer Database").
- Security zones defining trust boundaries.
- Edges with protocol and encryption metadata.

### 2. Review Automated Findings

The rule engine runs automatically. Open the **Manual Findings Workbench** and review:
- Are there cross-zone flows missing encryption? (TB-001)
- Are there sensitive data stores without access controls? (DP-002)
- Do external-facing components have authentication? (IA-001)
- Are there single points of failure? (AR-001)

Set mitigation statuses as you address each finding.

### 3. Work Through the STRIDE Matrix

Go to the **STRIDE Matrix** tab. For each element in your diagram, consider all six STRIDE categories:
- Can this component be spoofed?
- Can the data flowing through it be tampered with?
- Is there sufficient logging for non-repudiation?
- Could information be disclosed?
- Is it vulnerable to denial of service?
- Could an attacker elevate their privileges through it?

Mark each cell as Applicable, N/A, Mitigated, or Accepted. Aim for 100% coverage.

### 4. Define Attack Paths

Open the **Attack Paths Panel** and create paths for your key threat scenarios:

**Example: External Attacker to Database**
1. Name: "SQL injection to customer data exfiltration"
2. STRIDE: Information Disclosure
3. Risk Level: Critical
4. Build the path: User → API Gateway edge → API Gateway → App Server edge → App Server → Database edge
5. Description: "An external attacker exploits insufficient input validation at the API gateway to inject SQL queries through the application server, ultimately exfiltrating customer records from the database."

**Example: Insider Lateral Movement**
1. Name: "Compromised employee to admin access"
2. STRIDE: Elevation of Privilege
3. Risk Level: High
4. Build the path: Employee Workstation → Internal Network edge → App Server → Admin Interface edge
5. PASTA Stage: Stage 5 (Vulnerability Analysis)

### 5. Import Paths into GRC Assessment

Switch to GRC, create an assessment scoped to your system, and import both attack paths. The assessment canvas now shows the relevant nodes and edges, and the path cards document the ordered step sequences.

### 6. Link to Risks

In the Risks tab, create or link risks that correspond to your attack paths:
- "SQL injection leading to data exfiltration" — Tier 3 risk, linked to the assessment, scored for likelihood and impact.
- "Lateral movement from compromised endpoint" — Tier 3 risk, linked to the assessment, treatment strategy set to Mitigate.

### 7. Map to Compliance Controls

In the Compliance tab, map SoA entries to the risks:
- OWASP A03 (Injection) → linked to the SQL injection risk.
- NIST AC-6 (Least Privilege) → linked to the lateral movement risk.

### 8. Register Implemented Controls

In the Implemented Controls tab, document what you actually have deployed:
- "AWS WAF" — Technical, Network Security, Fully Automated. Linked to the SQL injection risk, linked to the API Gateway asset, linked to the assessment.
- "CrowdStrike Falcon EDR" — Technical, Endpoint Protection, Fully Automated. Linked to the lateral movement risk, linked to the Workstation asset.
- "Okta MFA" — Technical, Identity Management, Fully Automated. Linked to both risks, linked to the assessment.

Link each implemented control to the SoA entries it satisfies to close the loop between framework requirements and deployed technology.

### 9. Create Security Initiatives for Gaps

Where you have residual risk that current controls don't fully address, create security initiatives:
- "Zero Trust Network Segmentation" — Category: Uplift, Priority: High. Current state: "Flat internal network with limited microsegmentation." Target state: "Full microsegmentation with identity-based access policies between all service tiers." Link to the lateral movement risk, link to the assessment.
  - Milestone 1: "Deploy microsegmentation policy engine" — Due: Q2, Owner: Network Team.
  - Milestone 2: "Migrate app server tier to segmented VLAN" — Due: Q3, Owner: Platform Team.
  - Milestone 3: "Enforce identity-based east-west traffic policies" — Due: Q4, Owner: Security Team.

Link the initiative to the assessment so the assessment documents that residual risk is being actively treated.

### 10. Generate Reports and Track Progress

From the assessment workspace, export a report in PDF, HTML, or text. The report includes:
- Assessment scope and tier filter summary.
- Threat model node and connection counts.
- Attack path traversal steps with descriptions.
- Linked risks with scores and treatment strategies.
- Linked implemented controls.
- Linked security initiatives.

From the **Reporting** tab:
- Build custom charts (e.g., a bar chart of risks by treatment strategy, a pie chart of implemented control types, a line chart of initiative progress over time).
- Export CSV data for all GRC entities including implemented controls and initiatives.

From the **Dashboard**:
- Monitor implemented control metrics (total, active, overdue for review).
- Monitor initiative metrics (total, active, overdue).
- Check appetite breach count to see if residual risks exceed tolerance.

From **Workflow & Config → Workflow & Health**:
- Check for implemented controls missing evidence or overdue for review.
- Check for stalled initiatives (in progress but no milestones completed).
- Check for overdue initiative milestones.
- Review auto-generated gap tasks for any new issues.

---

## Persistence and Saving

- **Findings** are stored in the diagram file (`diagram.manualFindings` array). They persist across saves and reloads.
- **Attack paths** are stored in the diagram file (`diagram.attackPaths` array).
- **Mitigation statuses** and **STRIDE matrix overrides** are tracked locally.
- **GRC assessment attack paths** are stored in the GRC workspace within the same save file.
- **Implemented controls** and **security initiatives** are stored in the GRC workspace.

Everything is in one file. No backend, no cloud, no database required.

---

## Tips for Effective Manual Threat Modeling

1. **Start with the rule engine.** Let the automated checks catch the obvious issues before you start manual analysis.
2. **Use the STRIDE matrix systematically.** Don't just look at the high-severity findings — work through every element and every STRIDE category. The matrix makes gaps visible.
3. **Name your attack paths clearly.** A good path name describes the attacker's goal, not just the route (e.g., "Data exfiltration via API misconfiguration" rather than "Path 1").
4. **Use PASTA stages for methodology rigour.** If you need to demonstrate a structured process (for audits or compliance), tag paths with PASTA stages and use the methodology tab to track progress.
5. **Import paths into assessments early.** Don't wait until the assessment is complete — import paths as you create them so the assessment workspace stays current.
6. **Document your deployed controls.** For every attack path, register the implemented controls that block or detect each step. This gives auditors concrete evidence of your defensive posture.
7. **Create initiatives for gaps.** Where attack paths reveal risks that current controls don't fully mitigate, create security initiatives with milestones and deadlines. This shows a structured plan for closing gaps.
8. **Link assessments bidirectionally.** Link implemented controls and initiatives to your assessment, and link the assessment back from those entities. The bidirectional linkage makes it easy to trace from any entity to the full context.
9. **Use the focus buttons.** Both the findings workbench and the assessment canvas have navigation buttons that jump to the exact diagram element. Use them to keep context while reviewing.
10. **Export regularly.** The text/HTML export from the workbench captures everything — use it as a snapshot of your threat model at a point in time.
