# Canvas Non-AI Analysis Layer

This document describes the implemented non-AI analysis system that runs locally on the canvas. It adds a visual analysis layer, a deterministic rule engine, an attack paths panel, and a structured threat modeling workbench supporting both STRIDE and PASTA methodologies. No AI prompts or model calls are involved.

## Goals
- Provide immediate, deterministic feedback on diagram quality and security posture.
- Make threat modeling useful even without AI by surfacing rule-based findings.
- Keep analysis data and UI fully local; no backend or AI dependency.
- Add a visual overlay layer for deterministic rule feedback.
- Guide users systematically through STRIDE categories and PASTA stages with in-context help.

## Non-Goals
- No AI prompts or model calls.
- No auto-remediation or auto-modification of diagram elements.
- No cloud or network dependencies.

## User Experience Overview
- A "Analysis Overlay" visual layer renders on top of the canvas, visible by default.
- Overlay indicates potential rule violations; hover a flagged element to see a short rule description and an "Open Manual Findings" action.
- A **Manual Findings** workbench groups findings by node/edge in tabs, with a STRIDE matrix tab, attack paths tab, and methodology progress tab.
- An **Attack Paths Panel** in the diagram sidebar lets users define named attack paths: select a STRIDE category, mark edges on the diagram, and optionally assign a PASTA stage. Inline guidance (questions to ask, examples, mitigations) is available via popover for each STRIDE category and PASTA stage.
- Header tools include Rule Checks, export to text/HTML, and total counts.

## Visual Overlay Layer

### Rendering
- Overlay uses ReactFlow custom layer rendering with minimal impact on node/edge rendering.
- Nodes and edges can be flagged via deterministic findings without inline label badge icons.
- Zones show boundary alerts (e.g., missing boundary definition or mixed classification).

### Visual Rules
- Nodes: flagged styling without label badge icons.
- Edges: no inline label badge icon.
- Zones: dashed border when a rule is potentially violated.

### Controls
- Manual findings window: Dedicated button to open the full workbench.

## Non-AI Analysis Engine

### Scope
- Reads current zones, nodes, edges, and their metadata.
- Produces findings with deterministic rules.
- Operates on canvas changes (debounced).

### Data Inputs
- Node fields: type, zone, data classification, protocols, vendor/product/version/patch, components list, securityControls, DFD annotations.
- Edge fields: label, description, protocol, encryption, port range, bandwidth, latency, redundancy, data classification, securityControls, flow zone.
- Zone fields: type, name, data classification, boundary tags.

### Findings Model
```
ManualFinding {
  id: string;
  category: 'dfd' | 'boundary' | 'data' | 'identity' | 'encryption' | 'availability' | 'logging' | 'configuration' | 'threat' | 'attackpath';
  title: string;
  description: string;
  related: { nodeIds: string[]; edgeIds: string[]; zoneIds: string[] };
  recommendations: string[];
  ruleId: string;
  createdAt: number;
  updatedAt: number;
  mitigationStatus?: 'not_addressed' | 'in_progress' | 'mitigated' | 'accepted' | 'transferred';
  mitigationNotes?: string;
  attackPathId?: string;
  strideCategories?: StrideCategory[];
}
```

### Output
- Stored in local state under `ManualAnalysisContext`.
- Exportable in diagram JSON (optional), but not sent to AI.
- Findings are stable across reloads if stored in file save.

## Core Rule Sets

Rule guidance is aligned with:
- OWASP Threat Modeling guidance for DFDs and common security controls.
- Microsoft STRIDE/DFD methodology and typical DFD integrity constraints.

### 1) DFD Integrity Rules (OWASP + Microsoft STRIDE/DFD)
- DFD-001: External entity must not directly connect to data store.
- DFD-002: Data flow must have a label (data name).
- DFD-003: Process must have at least one input and one output.
- DFD-004: Data store must be connected to at least one process.
- DFD-005: Unconnected node (or isolated subgraph) flagged.
- DFD-006: DFD actor/process/store missing type annotation.

### 2) Trust Boundary Rules (OWASP + Microsoft STRIDE/DFD)
- TB-001: Flow crossing zones must specify protocol and encryption.
- TB-002: Flow from lower trust to higher trust requires auth.
- TB-003: Trust boundary missing type definition.
- TB-004: Zone without classification when containing sensitive data.

### 3) Data Protection Rules (OWASP)
- DP-001: Sensitive data in transit without encryption.
- DP-002: Sensitive data at rest in a store without encryption control.
- DP-003: PII/PHI/PCI flows must include logging or monitoring control.

### 4) Identity and Access Rules (OWASP)
- IA-001: Any external ingress to internal zone must specify auth mechanism.
- IA-002: Admin or management interfaces should not be reachable from external zone.
- IA-003: Missing MFA control for privileged components.

### 5) Availability and Resilience Rules (OWASP)
- AR-001: Single points of failure (node with many inbound/outbound).
- AR-EDGE-001: Sensitive or critical flow missing redundancy.
- AR-002: Critical zone with no redundancy noted in controls.

### 6) Observability Rules (OWASP)
- OB-001: Edge with sensitive data but no logging control.
- OB-002: Security controls node missing connections to monitored components.

### 7) OWASP Top 10 Coverage (2021)
- A01: Broken Access Control (authorization/missing auth checks on cross-zone flows).
- A02: Cryptographic Failures (missing encryption in transit/at rest).
- A03: Injection (external-facing components without validation controls).
- A04: Insecure Design (DFD integrity gaps and missing classifications).
- A05: Security Misconfiguration (exposed components lacking security controls).
- A06: Vulnerable and Outdated Components (missing version/patch metadata).
- A07: Identification and Authentication Failures (missing or weak auth/MFA on privileged flows).
- A08: Software and Data Integrity Failures (missing artifact integrity controls).
- A09: Security Logging and Monitoring Failures (missing logging/monitoring on sensitive flows).
- A10: Server-Side Request Forgery (SSRF) (missing egress controls on outbound HTTP/S).

### 8) STRIDE Coverage
- S01: Spoofing (missing authentication/MFA on low-to-high trust flows or external ingress).
- S02: Tampering (sensitive data or artifacts without integrity/encryption controls).
- S03: Repudiation (sensitive flows/components missing logging or audit controls).
- S04: Information Disclosure (sensitive data without classification or encryption at rest/in transit).
- S05: Denial of Service (single points of failure, missing redundancy, or missing traffic protections).
- S06: Elevation of Privilege (privileged components/flows missing authorization controls).

### 9) Node-Type Contextual STRIDE Hints (Pass 2.5)

Every non-structural node in the diagram receives one additional contextual finding that describes the STRIDE threat areas most inherently relevant to its **component type** — regardless of what data flows are connected to it. This finding is generated by `ManualAnalysisService.ts` (Pass 2.5) using a pure lookup against `src/data/nodeTypeContextHints.ts`.

#### How it works
1. For each node (excluding security zones, DFD structural primitives, and layout-only types), the engine looks up the node's `node.type` string in `nodeTypeContextHints`.
2. If no specific entry exists, it falls back to the node's DFD category (`dataStore`, `process`, or `actor`) to find a generic hint.
3. The hint is emitted as a `ManualFinding` with `category: 'threat'`, one or more `strideCategories` chips, and actionable recommendations.

#### Hint coverage

| Rule ID | Applies to | STRIDE focus |
|---------|-----------|-------------|
| `CTX-STORAGE` | `storage`, `cloudStorage` | Information Disclosure, Tampering, Repudiation |
| `CTX-DB` | `database`, `dataWarehouse` | Tampering, Information Disclosure, EoP, Repudiation |
| `CTX-BULK-STORE` | `fileServer` | Tampering, Information Disclosure, DoS, Repudiation |
| `CTX-CACHE` | `cache` | Information Disclosure, Tampering, DoS |
| `CTX-WEB` | `webServer` | Tampering, Information Disclosure, EoP, DoS |
| `CTX-APP` | `application` | EoP, Tampering, Spoofing, Information Disclosure |
| `CTX-APIGW` | `apiGateway` | Spoofing, EoP, DoS |
| `CTX-MSG` | `messageQueue` | Spoofing, Tampering, Repudiation, DoS |
| `CTX-FW` | `firewall` | EoP, Tampering, Repudiation |
| `CTX-LB` | `loadBalancer` | DoS, Spoofing, EoP |
| `CTX-ROUTER` | `router`, `switch`, `dns` | Spoofing, Tampering, Information Disclosure |
| `CTX-MONITOR` | `monitor` | Tampering, Repudiation, Information Disclosure |
| `CTX-KMS` | `keyManagement` | Information Disclosure, EoP, Repudiation |
| `CTX-IAM` | `identityProvider` | Spoofing, EoP, Repudiation |
| `CTX-PROXY` | `proxy` | Spoofing, Information Disclosure, EoP |
| `CTX-VPN` | `vpn` | Spoofing, EoP, DoS |
| `CTX-IDS` | `ids` | Tampering, Repudiation, EoP |
| `CTX-PAM` | `bastionHost` | Spoofing, EoP, Repudiation |
| `CTX-CICD` | `cicdPipeline` | Tampering, EoP, Repudiation |
| `CTX-COMPUTE` | `virtualMachine`, `container`, `server` | EoP, Tampering, Information Disclosure |
| `CTX-OT` | `plc`, `rtu`, `scada` | Tampering, DoS, Spoofing |
| `CTX-AI` | `aiModel`, `llmService` | Spoofing, Information Disclosure, Tampering |
| `CTX-VECDB` | `vectorDatabase` | Information Disclosure, Tampering, Repudiation |
| `CTX-ENDPOINT` | `workstation`, `laptop`, `desktop`, `endpoint`, `smartphone`, `tablet` | Spoofing, Tampering, Information Disclosure |
| `CTX-DATASTORE` | Any `dfdCategory = dataStore` fallback | Tampering, Information Disclosure, DoS, Repudiation |
| `CTX-PROCESS` | Any `dfdCategory = process` fallback | Spoofing, Tampering, EoP, DoS |
| `CTX-ACTOR` | Any `dfdCategory = actor` fallback | Spoofing, Repudiation, Information Disclosure |

#### Key design decisions
- **Type-driven only**: no keyword matching on user-entered fields. The lookup is purely `node.type` → DFD category. This keeps findings deterministic and independent of how the user named or described the node.
- **One finding per node**: the hint is advisory and contextual, not a policy violation. It surfaces STRIDE categories the user should focus their analysis on for that component type.
- **Skipped types**: DFD structural primitives (`dfdActor`, `dfdProcess`, `dfdDataStore`, `dfdTrustBoundary`, `securityZone`) and layout-only types (`freehand`, `shape`, `textAnnotation`) do not receive a CTX hint, as they carry no architectural meaning.
- **Extensibility**: adding a new node type context hint requires only a new entry in `src/data/nodeTypeContextHints.ts` and a corresponding documentation entry in `src/data/manualRuleCatalog.ts`. No changes to the analysis engine or UI are needed.

## Finding Severity Heuristics
- Critical: policy breach with sensitive data exposure (e.g., PII + unencrypted external flow).
- High: cross-zone flow missing auth or encryption.
- Medium: incomplete metadata or missing labels for sensitive flows.
- Low: best-practice gaps or mild DFD violations.
- Info: hygiene and completeness suggestions.

## Analysis Triggers
- Debounced recompute on:
  - Node/edge create, delete, or update.
  - Zone changes.
  - Metadata edits in NodeEditor/EdgeEditor.
- Manual "Re-run Analysis" button in Manual Findings panel.

## UI Components

### Attack Paths Panel (`src/components/diagram/AttackPathsPanel.tsx`)
Located in the diagram editor sidebar. Lets users define and manage named attack paths tied to STRIDE categories.

#### Path Management
- Summary header shows total path count and a critical/high badge count.
- **Create a path**: enter a name, select a STRIDE category, click Add. A `?` icon next to the STRIDE select opens the category guidance popover.
- Each path is a **collapsible card**. The collapsed header shows: STRIDE chip (colour-coded, clickable for guidance), path name, risk level chip, step count, expand chevron.
- **Expanded path editor** contains:
  - Name, STRIDE category select (with `?` guidance button), risk level select.
  - Optional PASTA stage assignment dropdown (stages 1–7) with a `?` button for stage guidance.
  - Description text area.
  - **Build Path button**: toggles edge-click mode — clicking edges on the canvas adds/removes them from the path (edges animate red when active).
  - Ordered steps list with up/down reorder and remove buttons per step.
  - Auto-order button (graph traversal).
  - Delete path button.

#### STRIDE Guidance Popover
Triggered by clicking any STRIDE chip or `?` button. Shows for the selected category:
- Description and threat statement.
- DFD element applicability chips (Process, Data Store, Data Flow, Actor).
- Numbered questions to ask for each element in the diagram.
- Attack examples (shown in red).
- Key mitigations (shown in green).
- OWASP Top 10 mappings.

#### PASTA Stage Guidance Popover
Triggered by clicking a `?` next to the PASTA stage field. Shows for the selected stage:
- Stage name and description.
- Practical guidance callout.
- Questions to ask.
- Expected outputs (shown in green).

#### Methodology Guide Section
A collapsible accordion at the top of the panel listing:
- All 6 STRIDE categories as clickable rows (STRIDE chip, name, threat statement, `?` icon).
- All 7 PASTA stages as clickable rows (stage number chip, short name, `?` icon).
Clicking any row opens the corresponding guidance popover.

### Manual Findings Workbench (`src/components/ManualFindingsWindow.tsx`)
A full-screen workbench dialog with four tabs.

#### Tab 1: Findings
- Per-element (node/edge/zone) tabs with findings.
- Autocomplete search to jump to any element.
- Each finding shows: rule ID, category, description, STRIDE categories (chips), mitigation status selector (Not Addressed / In Progress / Mitigated / Accepted / Transferred), mitigation notes, rule explanation, why it matters, how to fix, OWASP and STRIDE references, triggered-by context, diagram context.
- Focus Node / Focus Edge / Focus Zone buttons to navigate the canvas.

#### Tab 2: STRIDE Matrix
- **Category guidance bar**: row of chips (S — Spoofing, T — Tampering, etc.). Clicking a chip toggles an inline guidance panel showing:
  - Description and DFD applicability chips.
  - Two-column layout: questions to ask (numbered) on the left; attack examples (red) and key mitigations (green) on the right.
  - Element count and finding count for that category.
  - OWASP mapping chips.
- **STRIDE matrix**: grid of elements (rows) × STRIDE categories (columns). Each cell shows applicability status, finding count, and a per-element STRIDE override select (Applicable / N/A / Mitigated / Accepted).
- Progress summary: assessed cells / applicable cells, completion percentage.

#### Tab 3: Attack Paths
- Lists all defined attack paths from the diagram.
- Each path card shows: STRIDE chip, risk level chip, path name, step count.
- Expandable to show ordered steps (source → target) with Focus Edge button per step, and related threat findings with their mitigation status.

#### Tab 4: Methodology
- **STRIDE 4-Step progress**: four phases (Diagram, Identify, Mitigate, Validate) each showing a percentage progress bar and detail text.
- **PASTA 7-Step guide**: each of the 7 stages is a collapsible card. Collapsed state shows stage number, name, and Complete/Pending badge. Expanded state shows:
  - Stage description.
  - Practical guidance callout (blue left-border box).
  - Numbered questions to ask.
  - Expected outputs (in green).

#### Export and Rule Catalog
- Export to text or HTML includes: all findings with context, STRIDE matrix summary, attack path list with steps, methodology progress, rule catalog, STRIDE rule mappings, and threat pattern library.
- Rule Checks dialog enumerates all deterministic rules, their data sources, conditions, and STRIDE mappings.

#### Small-Device UX
- Report tabs switch to a horizontally scrollable tab strip on phone/tablet.
- Report dialogs use full-screen mode on phone with explicit close controls.
- Node/edge editors expose an always-visible close button in the title bar on compact viewports.
- Touch interaction: "tap to select, tap again to open editor".
- QuickInspector remains available on compact viewports.

#### Diagram Context
Compact "Connection Information" panel for edges:
- Shows source → target with an arrow.
- Includes each node's icon, label, type, and index code.

### Overlay Inspector
- Hover a node/edge/zone to show a short rule summary.
- "Open Manual Findings" action in the hover tooltip.

## Guidance Data (`src/utils/attackPathUtils.ts`)

### STRIDE_DETAILS
A typed record `Record<StrideCategory, StrideDetail>` with detailed guidance for each of the 6 STRIDE categories. Each entry includes: `description`, `threat`, `dfdApplicability`, `questionsToAsk` (5), `examples` (5), `mitigations` (6), `owasp` references.

### PASTA_STAGES
An array of 7 `PastaStage` objects covering the full PASTA methodology. Each stage includes: `id`, `name`, `shortName`, `description`, `questionsToAsk` (5), `outputs` (4), `guidance` (practical tip).

## Persistence and Storage
- Findings stored in diagram file (optional): `diagram.manualFindings` array.
- Attack paths stored in diagram file: `diagram.attackPaths` array (`DiagramAttackPath[]`).
- No backend persistence required.

## Integration Points

### Settings
- No user-facing toggle for manual analysis overlay badge visibility.

### State
- `ManualAnalysisContext` with findings state and recompute method.
- `ThreatModelUserState` tracks per-finding mitigation status/notes and per-element STRIDE overrides.

### Rendering
- Overlay component renders after edges, before UI panels: `AnalysisOverlayLayer.tsx`.
- Isometric view: findings are still available through the same manual findings workflow.

## Isometric View Mapping Details

### 3D Marker Types
- Inline warning glyph badges on node/edge labels are removed.

### Interaction
- Hovering or selecting 3D entities still supports the same inspection and manual findings workflow.

### Data Mapping
- The isometric layer reuses the same findings data from `ManualAnalysisContext`.
- 3D entities use IDs consistent with ReactFlow nodes/edges/zones for lookup.
- Marker placement is computed from:
  - Node: existing `diagramToGame` node position.
  - Edge: midpoint of generated 3D path in `ConnectionPath`.
  - Zone: bounds from `SecurityZone` entity geometry.

### Rendering Hooks
- `src/components/IsometricView/IsometricScene.tsx`: renders entity labels and interaction surfaces without warning badge overlays.
- `src/components/IsometricView/entities/ConnectionPath.tsx`: renders edge labels without warning badge icons.
- `src/components/IsometricView/entities/NodeBuilding.tsx`: renders node labels without warning badge icons.

## GRC Integration

Named attack paths defined in the diagram (`DiagramAttackPath[]`) are surfaced to the GRC module via `DiagramContextSnapshot.attackPaths`. The GRC Assessment threat model section can import these paths directly, auto-populating the assessment canvas with referenced nodes and edges and creating `AssessmentAttackPath` records with full STRIDE and risk level metadata. See `docs/GRC-Module-Reference.md` for details.

## Extensibility
- Rule definitions are data-driven: `rules/dfdRules.ts`, `rules/trustBoundaryRules.ts`.
- `STRIDE_DETAILS` and `PASTA_STAGES` in `src/utils/attackPathUtils.ts` can be extended with additional guidance or custom categories.
- Allow custom rules via JSON config (future).

## Open Questions
- Should some rules be disabled by project type (e.g., OT/ICS)?
- Should the overlay show numeric counts on zones and groups?
- Should findings be included in diagram export reports by default?

## Success Criteria
- Users can complete a threat model with no AI usage.
- The overlay provides actionable, consistent, and explainable findings.
- Users can systematically work through all 6 STRIDE categories with guided questions and examples.
- Users can follow the PASTA 7-step methodology with in-context guidance at each stage.
- Named attack paths connect diagram analysis to GRC assessments.
- Performance remains responsive for 200+ nodes.
