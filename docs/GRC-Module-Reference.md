# GRC Module Reference

## Purpose and Scope
The GRC module runs inside ContextCypher as a first-class operating mode alongside Diagram mode.

Current scope:
- Single-user, local-first operation.
- Diagram and GRC state co-saved in one JSON workspace file.
- Workflow-centric risk/compliance execution with in-app task tracking.
- No multi-user tenancy or external database requirement in this phase.

## What Changed in This Iteration
This implementation deepens process orchestration across Assets, Risks, Compliance, Assessments, and Reporting by adding:
- Scope-aware SoA editing keyed by `controlSet + control + scopeType + scopeId`.
- A workflow task model (`workflowTasks`) tied to risks/controls/assessments/assets.
- Workflow health analytics and auto-generated gap tasks.
- Template-driven workflow seeding (onboarding, monthly governance, incident response).
- A practical in-app workflow guide embedded in **Workflow & Config** for operating procedures and playbooks.
- Scrollable top tab navigation with **Dashboard** pinned as the first tab.
- A persistent right-side **AI Analysis panel** for GRC-focused chat across all GRC tabs.
- Opt-in GRC prompt context controls (`aiAssist`) so users can tune context scope, detail, sections, and limits.
- Tasks export and task metrics in Dashboard/Reporting.
- Enhanced task-board linkage workflow:
  - Manual task creation supports optional links to risk, assessment, asset, control set, and control.
  - Linked-item preview is shown before creating the task.
  - Control selection is constrained by selected control set to prevent invalid link pairs.
- Referential cleanup on deletion:
  - Deleting an asset removes dependent links from risks, threat actors, threat scenarios, and workflow tasks.
  - Deleting a risk removes dependent links from SoA, assessments/SRMP actions, workflow tasks, threat scenarios, and governance documents.
- Expanded asset classification and criticality modeling:
  - Asset domain + category across IT / OT / Application.
  - Per-asset business criticality and security criticality ratings.
  - Configurable asset category catalogues and criticality scales in Configuration.
  - Asset criticality rollups surfaced in Dashboard, Assessments, and Reporting.
- Multi-scope assessment model:
  - Assessments support scope item sets (`system`, `diagram`, `diagram_segment`, `asset_group`, `application`, `osi_layer`).
  - Assessments support Tier 1-4 filter overlays for scoped risk selection.
  - Assessments include an attack path diagram canvas for visual attack-path representation (no scoring/heat map behavior).
  - Named attack paths defined in the diagram editor (STRIDE category, risk level, ordered edge steps) can be imported directly into any assessment, auto-populating canvas nodes/edges and creating `AssessmentAttackPath` records with full STRIDE and risk level metadata.
  - Scope options are configurable in Configuration (enabled types, application options, OSI options, protocol->OSI mapping).
- One Risk Management Plan (SRMP) per assessment:
  - New dedicated **Risk Management Plan** tab.
  - Plans are assessment-bound (no standalone plan creation).
  - Plan actions can be converted into Workflow tasks.
- Diagram zone navigation support:
  - Node editor exposes zone shortcuts to open matching zonal assessment/SRMP workspaces in GRC.
- Tooltip guidance across GRC tabs, with deeper coverage in Configuration controls.
- New **Governance** tab for document registry (policies, processes, SOPs, guidelines).
- Comprehensive UI/UX overhaul across all tabs:
  - Descriptive tooltips across inputs, inline editors, column headers, and action buttons (including confirmation dialogs).
  - Inline editing for table rows (click-to-edit titles, owners, dates, statuses, dropdowns).
  - Delete with confirmation dialogs on all entity types (assets, risks, assessments, tasks, control sets, evidence, governance documents).
  - Cascading statement-based tier taxonomy dropdowns (Tier 1→2→3→4) replacing free-text inputs in Risks and Assessments.
  - Multi-control-set tabbed view in Compliance with per-set progress indicators.
  - MUI Dialog-based evidence entry replacing `window.prompt()`.
  - Colored severity badges on risk ratings.
  - Rich empty states with instructional guidance on all tabs.
  - Restructured Workflow Guide into collapsible Health & Guidance zone plus always-visible Task Board.
  - Task filtering by status, priority, type, and text search.
  - Stepped assessment creation flow with section dividers.
  - Governance document filtering by type, status, and text search.
  - Linked-risks count column in Assets table.
- **Threat Profiles** tab for structured threat landscape management:
  - Threat actor registry (type, capability, resource level, motivation, targeted assets, tags).
  - Threat scenario documentation (actor linkage, targeted assets, MITRE ATT&CK techniques, linked risks).
  - Filtering by actor type/capability and by scenario actor.
- **Configurable Risk Appetite** rules:
  - Scoped appetite rules that override the global threshold by asset domain, risk tier, and/or asset criticality.
  - Most-specific-first resolution algorithm with tie-break by lowest threshold.
  - Dashboard appetite breach tracking.
- Threat actor linkage on Risks and Assessments:
  - Optional threat actor assignment per risk.
  - Optional threat actor multi-select per assessment.
- **Implemented Controls** tab for registering deployed security mechanisms (technologies, tools, policies, processes) with linkage to SoA entries, risks, and assets.
- Two new CSV exports: Threat Profiles, Appetite Rules.
- **Persistent Findings** with table layout, configurable columns, sorting, expandable detail, inline creation, severity/type classification, focus-node navigation, finding-to-risk/task linkage, rule engine sync, and findings CSV export.
- **Third-Party Risk Management (TPRM)** tab for vendor/supplier risk profile management:
  - Third-party register with category, status, risk rating, data classification, contact details, contract expiry, and review dates.
  - Linked assets and linked risks via multi-select with clickable chips.
  - Configurable table columns, sortable headers, expandable detail rows, category/status chip filters, text search.
  - Dashboard KPI card with total count and high/critical risk count.
  - CSV export, AI prompt context section, workflow health overdue-review tracking.
- **Security Initiatives** tab for strategic security improvement program tracking:
  - Initiative register with category (uplift, remediation, compliance, transformation, hardening, other), status lifecycle (proposed→approved→in_progress→on_hold→completed/cancelled), priority (critical, high, medium, low).
  - Current state and target state narrative fields describing security posture gap.
  - Nested milestones with status tracking (pending, in_progress, completed, skipped), due dates, and owners.
  - Progress derived from completed/total milestones (no stored percentage).
  - Linked risks, linked control sets, and linked assets via multi-select with clickable chips.
  - Owner and executive sponsor fields.
  - Configurable table columns, sortable headers, expandable detail rows, category/status chip filters, text search.
  - Dashboard KPI card with total count, active count, and overdue count.
  - CSV export, AI prompt context section, workflow health stalled/overdue-milestone tracking.
- **Custom Chart Builder** in Reporting:
  - User-created charts from any GRC data source with 9 visualization types (bar, horizontal bar, pie, donut, stacked bar, line, area, radar, treemap).
  - 11 data sources (risks, assets, findings, tasks, third parties, governance docs, threat actors, SoA entries, assessments, threat scenarios, appetite rules) with per-source groupable fields.
  - 5 color schemes (default, severity, cool, warm, monochrome).
  - Time-bucketed line/area charts by week/month/quarter granularity.
  - Stacked bar charts with primary + secondary group-by fields.
  - Auto-generated chart titles from data source + field labels (user-editable).
  - Up to 20 custom charts persisted in `workspace.config.customCharts`.
  - Edit and delete custom charts inline.
  - Dialog-based builder with visual chart type picker and color swatch selector.
- Shared chart constants (`SEVERITY_COLORS`, `PIE_PALETTE`, `IMPL_COLORS`, `TASK_STATUS_COLORS`, `LBL`, `countBy`) extracted to `grcShared.ts` for reuse across Reporting and Custom Chart Renderer.
- Merged **Workflow Guide** and **Configuration** tabs into a single **Workflow & Config** tab (11 tabs total):
  - Seven sub-sections: Workflow & Health, Task Board, Risk Model, Risk Statements, Risk Appetite, Defaults & Display, Technical Reference.
  - Removed the Workflow & Configuration map table and replaced it with direct section navigation.
  - Active section state is now visually emphasized in the inner tab navigation.
  - Workflow health now includes orphan risks, appetite breach count, and governance overdue review count.
  - Gap-to-task generation expanded: appetite breach escalation tasks, governance review overdue tasks.

The process design is influenced by proven patterns in open-source GRC platforms (task-driven remediation, scope-first control mapping, evidence-centered closure), adapted to ContextCypher's local-first architecture.

## Open-Source Adoption and License Posture
Open-source references were evaluated with explicit license constraints before pattern adoption.

- Direct code/process reuse candidates:
  - GovReady-Q (`Apache-2.0`)
  - OpenControl Standards (`Unlicense`)
- Conditional reuse:
  - SimpleRisk (`MPL-2.0`, file-level copyleft)
- Reference-only in current posture:
  - CISO Assistant Community (`AGPL-3.0`)
  - riski-io/grc (`AGPL-3.0`)
  - OpenGRC (`CC BY-NC-SA 3.0`, non-commercial)

Full matrix and guardrails: `docs/GRC-Open-Source-Adoption-Matrix.md`.

## Integration Architecture

### App-level mode switching
- `src/App.tsx` manages `activeModule: 'diagram' | 'grc'`.
- `src/components/DiagramEditor.tsx` provides switching into GRC mode.
- `src/components/grc/GrcModule.tsx` provides switching back to diagram mode.
- The diagram editor remains mounted and is visibility-toggled (`display: block/none`) so diagram interaction state is preserved.
- The GRC module is conditionally mounted only while `activeModule === 'grc'`, preventing hidden GRC renders from consuming frame budget during diagram interaction.

### Shared state model
- `src/App.tsx` stores `grcWorkspace` in-memory.
- Diagram and GRC modes share this workspace through props.
- All workspace updates are normalized with `ensureGrcWorkspace(...)`.
- Because `grcWorkspace` is owned by `App`, unmounting/remounting `GrcModule` does not lose GRC data edits.

### GRC UI navigation state model
- `src/App.tsx` stores an in-memory `grcUiNavigationState` object separate from `grcWorkspace`.
- `grcUiNavigationState` contains:
  - `activeTab`: the currently selected top-level GRC tab.
  - `tabState`: per-tab lightweight view state (for example active assessment ID, expanded detail row IDs, selected report/config section).
- `src/components/grc/GrcModule.tsx` restores and persists this navigation state via `getTabViewState(...)` and `setTabViewState(...)`.
- Tab components use this state to restore where the user left off when switching Diagram ↔ GRC, without requiring hidden background mounting of the entire GRC module.

### Diagram context handoff
- Diagram emits `DiagramContextSnapshot`.
- GRC receives the snapshot and uses it to:
  - Sync assets from current nodes.
  - Scope SoA entries to the current diagram when applicable.
  - Seed risk/assessment context from active diagram operations.
  - Surface named attack paths (`DiagramContextSnapshot.attackPaths`) for import into GRC assessments — the assessment threat model section reads this list to populate the import dropdown.

### Node-type contextual STRIDE findings surfaced in GRC
The diagram's non-AI analysis engine (Pass 2.5 in `ManualAnalysisService.ts`) generates one contextual STRIDE hint per node based solely on the node's **component type** (e.g., `storage`, `database`, `apiGateway`). These findings appear in the Node Editor's Security Findings tab and in the Manual Findings Workbench.

When a GRC Assessment imports nodes from the diagram or uses the AI assist feature with diagram context enabled, these contextual hints inform the threat modelling narrative:
- The assessment's "Threat Model & Attack Paths" section surfaces imported node context, including STRIDE categories flagged for each component type.
- AI assist prompts include the diagram's node type metadata, enabling the model to reference known threat patterns for specific component categories without relying on free-text field matching.

**CTX-* rule IDs** (e.g., `CTX-STORAGE`, `CTX-DB`, `CTX-APIGW`) identify these contextual hints in the Manual Findings export and in rule catalog lookups. See `docs/Threat-Modeling-Manual-Layer.md` section 9 for the full table of coverage and design rationale.

### AI analysis integration
- GRC mode uses the same `/api/chat` and `/api/chat/stream` flow as Diagram mode.
- Full diagram context is retrieved from DiagramEditor through shared file actions (`getCurrentDiagram`) to avoid summary-only prompts.
- GRC mode appends a focused operating context block plus optional workspace data generated from `aiAssist` settings.
- Server-side prompt formatter remains the canonical diagram formatter and strips legacy client-injected diagram sections to prevent duplicate diagram context.
- Analysis UI is docked on the right and can be toggled open/closed without leaving the current GRC tab.

### Accessing GRC mode
- From the diagram editor, click the **GRC** button in the top toolbar to switch to the GRC module.
- From GRC, click the **Diagram** button in the top bar to switch back.
- Both modes stay mounted (diagram via CSS `display: block/none`, GRC conditionally rendered) so no data is lost when switching.
- The GRC workspace is stored alongside the diagram in the same save file — saving from either mode persists both.
- Opening a saved file that contains GRC data automatically restores the full GRC workspace.

### Diagram attack paths
Attack paths are defined in the **Attack Paths Panel** (left sidebar, "Attack Paths" tab):
1. Click **New Path** to start a named attack path.
2. Enter a path name, select a STRIDE category and risk level.
3. Click **Build Path** to enter path-building mode — the canvas highlights edges as candidates.
4. Click edges on the diagram to add or remove them from the path. Added edges animate in red.
5. The panel shows the ordered sequence of steps (source → edge → target) as you build.
6. Click **Done** to finish building. The path is saved with the diagram.

Each step in the path list has a **crosshair** (focus) button to zoom the diagram to that node or edge.

### Attack path integration with GRC
Named attack paths flow from the diagram into GRC Assessments:
1. In GRC, open or create an **Assessment** and expand its **Threat Model & Attack Paths** workspace section.
2. If the active diagram has named attack paths, an **Import Attack Paths** dropdown appears listing all available paths (with STRIDE category and risk level chips).
3. Select a path and click **Import Path**. The assessment canvas auto-creates nodes and edges matching the diagram path, and an `AssessmentAttackPath` record is stored with full metadata.
4. Re-importing the same path replaces the existing record in place.
5. Imported paths appear as collapsible cards below the canvas showing the ordered step sequence. Each step has a **Focus Edge** button to navigate the mini-canvas.
6. Double-clicking a linked canvas node or edge switches back to Diagram mode and focuses the original element.

This allows diagram-level threat path analysis to feed directly into formal GRC assessment documentation without manual re-entry.

## Persistence Model

### Single-file persistence
- Diagram save/save-as includes `grcWorkspace` payload.
- File open restores `grcWorkspace` when present, or defaults when absent.
- `grcUiNavigationState` is intentionally runtime-only and is not serialized into the workspace file in this iteration.

### Evidence persistence strategy
- SoA evidence is stored as metadata references only:
  - `kind: 'link'`
  - `kind: 'file_reference'`
- Binary evidence payloads are intentionally not embedded in save files.

## Data Model
Defined in `src/types/GrcTypes.ts`.

`GrcWorkspace` (`schemaVersion: '1.0'`) now includes:
- `assets`
- `findings`
- `risks`
- `assessments`
- `controlSets`
- `soaEntries`
- `workflowTasks`
- `tierCatalogue`
- `governanceDocuments`
- `threatActors`
- `threatScenarios`
- `appetiteRules`
- `thirdParties`
- `securityInitiatives`
- `implementedControls`
- `riskModel`
- `aiAssist`
- `config`

Compatibility posture:
- The current GRC schema/workflow is authoritative in this branch.
- Backward compatibility shims for older assessment/SRMP models are intentionally not maintained unless explicitly requested.

Key additions:
- `GrcControlSet.releaseDate` optional field (e.g. `"2020-09"`) to identify the month/year of a framework's release, persisted through hydration and displayed in the built-in framework catalog.
- `GrcTask` entity for treatment/evidence/review execution tracking.
- Task taxonomy: `type`, `status`, `priority`, owner/due-date, and linkage fields.
- Expanded dashboard metrics for task operations.
- Workflow health summary model for operational guidance (orphan risks, appetite breaches, governance review overdue).
- Assessment/SRMP model updates:
  - `GrcAssessment.scopeItems[]` + `tierFilter` drive scope and risk linkage.
  - `GrcAssessment.riskManagementPlan` stores the one-per-assessment SRMP.
  - `GrcAssessment.threatModel` stores attack path diagram nodes/edges with optional diagram references, an `attackPathDescription` field, and an `attackPaths?: AssessmentAttackPath[]` array populated by importing named attack paths from the diagram editor.
  - `GrcWorkspace.config.assessmentScopes` defines configurable scope catalogs.
- Governance document model:
  - `GrcGovernanceDocument` with type, status, owner, review dates, version, external URL, tags, and cross-linkages to risks/control sets/assessments.
  - Dashboard metrics: `governanceDocumentCount`, `activeGovernanceDocumentCount`.
- Threat profile model:
  - `GrcThreatActor` with type, capability level, resource level, motivation, description, targeted assets, and tags.
  - `GrcThreatScenario` with actor linkage, targeted assets, attack techniques, linked risks, and narrative likelihood/impact.
  - Dashboard metrics: `threatActorCount`, `threatScenarioCount`.
- Appetite rule model:
  - `GrcAppetiteRule` with optional scope fields (asset domain, tier 1, asset criticality min) and threshold score.
  - `resolveRiskAppetite()` resolves per-risk appetite using specificity-ranked rule matching.
  - Dashboard metric: `appetiteBreachCount`.
- Risk extensions: `threatActorId` optional field for actor attribution. `sourceFindingId` optional field for finding-to-risk traceability.
- Task extensions: `sourceFindingId` optional field for finding-to-task traceability.
- Assessment extensions: `threatActorIds` optional field for scoped threat actor linkage. `linkedImplementedControlIds: string[]` for referencing mitigating controls. `linkedInitiativeIds: string[]` for referencing initiatives that justify risk acceptance or strategic treatment.
- Finding model:
  - `GrcFinding` with type (`threat`, `vulnerability`, `weakness`, `observation`), severity (`critical`, `high`, `medium`, `low`, `info`), source (`rule_engine`, `manual`, `ai_analysis`), and status (`open`, `in_review`, `accepted`, `mitigated`, `dismissed`).
  - Linked node IDs, edge IDs, asset IDs, risk IDs, and task IDs for full traceability.
  - Optional rule engine metadata: `ruleId`, `category`, `strideCategories`.
  - Dashboard metrics: `findingCount`, `openFindingCount`, `criticalHighFindingCount`.
  - Export filename: `findingsCsv` in `ExportFilenames`.
- Third-party model:
  - `GrcThirdParty` with category (`cloud_provider`, `saas`, `managed_service`, `contractor`, `supplier`, `partner`, `other`), status (`active`, `under_review`, `onboarding`, `offboarding`, `terminated`), risk rating (`critical`, `high`, `medium`, `low`, `not_assessed`), data classification (`public`, `internal`, `confidential`, `restricted`), linked asset/risk IDs, contact details, contract expiry, assessment/review dates, and notes.
  - Dashboard metrics: `thirdPartyCount`, `highRiskThirdPartyCount`.
  - Workflow health metric: `thirdPartyOverdueReviewCount`.
  - Export filename: `thirdPartiesCsv` in `ExportFilenames`.
- Security initiative model:
  - `GrcSecurityInitiative` with category (`uplift`, `remediation`, `compliance`, `transformation`, `hardening`, `other`), status (`proposed`, `approved`, `in_progress`, `on_hold`, `completed`, `cancelled`), priority (`critical`, `high`, `medium`, `low`), owner, executive sponsor, current/target state narratives, start/target/completed dates, linked risk/control set/asset/assessment IDs, and notes. `linkedAssessmentIds: string[]` for bidirectional linkage to assessments.
  - `GrcInitiativeMilestone` nested array with id, title, description, status (`pending`, `in_progress`, `completed`, `skipped`), due date, completed date, and owner.
  - Dashboard metrics: `initiativeCount`, `activeInitiativeCount`, `overdueInitiativeCount`.
  - Workflow health metrics: `stalledInitiativeCount`, `overdueInitiativeMilestoneCount`.
  - Export filename: `initiativesCsv` in `ExportFilenames`.
- Implemented control model:
  - `GrcImplementedControl` with `id`, `title`, `description`, `controlType` (`technical`, `administrative`, `physical`, `operational`), `category` (13 values: `access_control`, `network_security`, `endpoint_protection`, `data_protection`, `identity_management`, `monitoring_logging`, `incident_response`, `vulnerability_management`, `encryption`, `backup_recovery`, `physical_security`, `policy_procedure`, `training_awareness`), `status` (`active`, `planned`, `under_review`, `deprecated`, `inactive`), `automationLevel` (`manual`, `semi_automated`, `fully_automated`), `owner`, `vendor`, `product`, `version`, `implementedDate`, `lastReviewDate`, `nextReviewDate`, notes.
  - Linkage arrays: `linkedSoaEntryIds`, `linkedRiskIds`, `linkedAssetIds`, `linkedAssessmentIds` for traceability to SoA entries, risks, assets, and assessments.
  - Dashboard metrics: `implementedControlCount`, `activeImplementedControlCount`, `overdueControlReviewCount`.
  - Workflow health metric: `overdueControlReviewCount`.
  - Export filename: `implementedControlsCsv` in `ExportFilenames`.
- Custom chart configuration model:
  - `CustomChartConfig` with `id`, `title`, `chartType` (`bar`, `horizontal_bar`, `pie`, `donut`, `stacked_bar`, `line`, `area`, `radar`, `treemap`), `dataSource` (one of 11 GRC collection keys), `groupByField`, optional `secondaryGroupByField`, optional `timeGranularity` (`week`, `month`, `quarter`), `colorScheme` (`default`, `severity`, `cool`, `warm`, `monochrome`), `createdAt`, `updatedAt`.
  - `GrcWorkspaceConfig.customCharts?: CustomChartConfig[]` persists user-defined chart definitions (max 20).

## GRC UI Capabilities

### Top-level tabs
- Dashboard
- Assets
- Findings
- Risks
- Compliance
- Assessments
- Risk Management Plan
- Governance
- Threat Profiles
- Third Parties
- Initiatives
- Implemented Controls
- Reporting
- Workflow & Config

### Workflow & Config (merged tab)
The former Workflow Guide and Configuration tabs are now merged into a single **Workflow & Config** tab with seven sub-sections accessible via inner tabs:

#### Sub-section: Workflow & Health
- Live workflow health indicators with badge counts:
  - Orphan risks (no linked assets or diagram nodes)
  - Unmitigated high/critical risks
  - Appetite breaches (risks exceeding resolved appetite threshold)
  - Controls without risk links
  - Implemented controls missing evidence
  - Assessment coverage percentage
  - Overdue/due-soon tasks
  - Governance documents overdue for review
  - Third parties overdue for review
  - Stalled security initiatives (in_progress with no milestone progress)
  - Overdue initiative milestones
  - Implemented controls overdue for review
- Recommended next actions generated from current health state.
- Live risk matrix preview reflecting the active model with global and scoped appetite threshold awareness.
- Practical workflow reference guide with expandable sections:
  - End-to-end operating flow (14 steps covering configuration through reporting, including threat profiles, governance, appetite rules, implemented controls, and security initiatives).
  - Component linkage reference (assets→risks, threat actors→risks, appetite rules→scoring, SoA, assessment threat-model links→diagram nodes/edges, assessments→SRMP, assessments↔implemented controls, assessments↔initiatives, governance→entities, security initiatives→risks/control sets/assets/assessments, task linkage + deletion hygiene).
  - Scope-driven assessment playbook.
  - Practical operating cadence (weekly, monthly, incident).

#### Sub-section: Task Board
- Task creation with type, priority, owner, due date, and optional linkage fields:
  - Linked risk.
  - Linked assessment.
  - Linked asset.
  - Linked control set + control.
- Link preview shown before task creation; control cannot be selected without a control set.
- Gap-to-task generation covering:
  - High/critical risks without SoA mitigations.
  - Implemented controls without evidence.
  - Risks exceeding their resolved appetite threshold (escalation tasks).
  - Governance documents past their next review date (review tasks).
- Template seeding for onboarding, monthly, and incident response operating cycles.
- Task filtering by status, priority, type, and text search with clear-all.
- Inline editing for all task fields (title, description, type, priority, owner, due date, status).
- Delete task with confirmation dialog.
- Task count badges (total, active, blocked).
- Tooltips on all inputs, columns, and action buttons.

#### Sub-section: Risk Model
- Risk model scales, global appetite threshold, and rescoring.
- Dynamic likelihood/impact scale sizing (for example 4x4, 5x5, 6x6) with guardrails.
- Configurable risk rating bands (label, numeric value, threshold ratio, color) with default scale:
  Catastrophic (6), Severe (5), Major (4), Moderate (3), Minor (2), Negligible (1).
- Preset selector for 6-level/5-level/4-level rating models with confirmation dialog before replacing in-editor rating settings.
- Improved appetite controls with numeric input plus slider bounded by the live matrix maximum score.

#### Sub-section: Risk Statements
- Tier 1-3 statement taxonomy authoring. Findings serve as operational evidence at the Tier 4 level.
- Default taxonomy uses board-level risk categories:
  - **Tier 2** — 6 board-level risk categories:
    1. **Critical System Disruption Risk** — Critical systems become unavailable, caused by cyber attacks or technical failures, resulting in disruption to essential services and operations.
    2. **Unauthorized Access Risk** — Unauthorized access to systems and data, caused by credential compromise, exploitation, or access control failures, resulting in breach of security controls.
    3. **Data Breach Risk** — Sensitive or personal data is exposed, caused by technical attacks, insider threats, or process failures, resulting in regulatory, financial, and reputational harm.
    4. **System Integrity Risk** — Systems or data are maliciously modified, caused by malware, supply chain compromise, or insider actions, resulting in loss of trust in system reliability.
    5. **Cyber Detection Risk** — Cyber incidents are not detected or contained in a timely manner, caused by insufficient monitoring, expertise, or response capability, resulting in extended impact and recovery delays.
    6. **Third Party Security Risk** — Security incidents originate from or are enabled by third parties, caused by supply chain compromise, vendor access, or telecommunications dependencies, resulting in cascading business impact.
  - **Tier 3** — 35 named risk scenarios (`GRCT3001`-`GRCT3035`) mapped to Tier 2 categories by risk domain.
  - **Tier 4** — Not generated in defaults. Findings (from the Findings tab) serve as operational evidence by linking findings -> risks, where risks carry Tier 1-4 taxonomy paths.
- Tier 3 import supports CSV/TSV columns including `Risk ID`, `Risk Name`, `Risk Statement`, `Domain`, `CIA Triad`, and `Impact Category`.

#### Sub-section: Risk Appetite
- Scoped risk appetite rules that override the global threshold:
  - Rules override the global threshold by asset domain, tier 1, and/or asset criticality minimum.
  - Specificity-ranked resolution: domain (+1), tier1 (+2), criticalityMin (+1); highest specificity wins; tie-break by lowest threshold.
  - Validation requires at least one scope field per rule.

#### Sub-section: Defaults & Display
- Defaults/display management including export filenames (`assets`, `risks`, `soa`, `tasks`, `plans`, `threatProfiles`, `appetiteRules`, `findings`, `thirdParties`, `initiatives`, `implementedControls`).
- Asset model configuration:
  - Author IT/OT/Application category catalogues.
  - Author business/security criticality rating scale values and labels.
  - Set default asset domain/category and default business/security criticality for new assets.
- Assessment scope catalog configuration:
  - Enable/disable available scope types.
  - Manage Application scope options.
  - Manage optional OSI layer scope options.
  - Maintain Protocol->OSI layer mappings used during OSI-scope risk resolution.
- Assessment defaults:
  - Default scope type/value/name.
  - Default Tier 1-4 filter values.
- AI assist prompt controls:
  - Enable/disable GRC context injection.
  - Scope: linked-to-active-diagram vs full workspace.
  - Detail: summary vs detailed.
  - Per-section toggles (assets, risks, SoA, tasks, assessments, threat profiles, governance documents, appetite rules, findings, third parties, security initiatives, implemented controls).
  - Max items per section (bounded for prompt-size control).

#### Sub-section: Technical Reference
- In-app comprehensive reference for the GRC data model presented in a consumer-friendly format with collapsible sections and tables.
- 11 reference sections:
  1. **Entity Types**: All 15 GRC entity types with purpose and key fields.
  2. **Entity Relationships**: Full linkage map organised by category (Diagram→GRC, Asset, Risk hub, Assessment, Compliance/Governance, Task generation sources) with link field references.
  3. **Tier Taxonomy Model**: Four-tier hierarchy (T1→T2→T3→T4) with editability rules, default Tier 2 categories, and Tier 3 import support.
  4. **Status Lifecycles**: Status values and typical progression flows for all 10 stateful entity types.
  5. **Risk Scoring Model**: Likelihood × impact matrix, inherent/residual scores, rating bands, appetite thresholds (global + scoped), and rescoring behaviour.
  6. **Deletion Behaviour**: Referential integrity cleanup matrix showing which entities are cleaned when each type is deleted.
  7. **Assessment Model**: Scope items, tier filters, threat model canvas, attack paths, SRMP, and assessment-specific linkages.
  8. **Persistence & Export**: Single-file save model, CSV export inventory, and report templates.
  9. **Backend API Surface**: All /api/grc endpoints with purpose descriptions and available built-in frameworks.
  10. **Diagram Integration Points**: Eight integration mechanisms between Diagram and GRC modes.
  11. **Configuration Options**: All configurable settings grouped by area.
- Live workspace entity counts displayed as chips at the top of the section.

### Assets
- Manual asset register entries.
- Diagram-to-asset synchronization.
- Linked-node visibility per asset.
- Asset classification fields:
  - Domain (`it`, `ot`, `cloud`, `iot`, `application`, `data`, `network`, `physical`, `people`)
  - Category (config-driven list by domain)
  - Business criticality and security criticality (config-driven scale)
- Linked-risks count column with colored indicators.
- Click-to-edit asset name in table rows.
- Delete asset with confirmation dialog and orphan-risk warning.
- Asset deletion automatically cleans stale references from risks, threat actors, threat scenarios, and workflow tasks.
- Tooltips on all form inputs and table columns.

### Findings
- Persistent finding register stored in `workspace.findings[]`.
- Table layout with configurable columns (ID, Finding, Type, Severity, Source, Status, Category, STRIDE, Component, Linked Risks, Owner, Actions).
- Column visibility/ordering via `useTableColumnConfig` + `TableColumnConfigPopover`.
- Sortable columns with default sort by severity (critical first).
- Expandable detail rows with description, recommendations, rule details, linked assets/risks/tasks, notes, timestamps.
- Finding types: `threat`, `vulnerability`, `weakness`, `observation`.
- Finding severity: `critical`, `high`, `medium`, `low`, `info` with colored badge chips.
- Finding sources: `rule_engine`, `manual`, `ai_analysis`.
- Finding status lifecycle: `open` → `in_review` → `accepted`/`mitigated`/`dismissed` (inline-editable dropdown).
- Filter bar: type chips, severity chips, category chips (only present categories), STRIDE chips, text search.
- **Sync from Rule Engine**: imports `ManualFinding[]` from the rule engine context, maps category to type/severity, auto-links assets via diagram node refs.
- **Manual finding creation**: inline collapsible form with title, description, type, severity, owner.
- **Focus Node**: Crosshair icon button dispatches `grc-focus-diagram-node` event to navigate to the affected diagram node.
- **Create Risk**: creates a `GrcRisk` with `sourceFindingId` set, adds risk ID to `finding.linkedRiskIds`.
- **Create Task**: creates a `GrcTask` with `sourceFindingId` set, adds task ID to `finding.linkedTaskIds`.
- **Delete finding**: confirmation dialog, cleans `sourceFindingId` references on linked risks/tasks.
- Linked assets auto-matched by `relatedNodeIds` against `asset.diagramRefs[].nodeId`.

### Risks
- **Configurable columns** via `useTableColumnConfig` with `TableColumnConfigPopover` gear icon (19 columns, 13 visible by default).
- **Column sorting** via `TableSortLabel` headers. Sortable: title, status, score, rating, treatment, owner, nextReview, tier2, tier3, controls, linkedAssets. Default: score descending (highest risk first).
- **Expandable detail rows** with Collapse for description, treatment plan, tier path breadcrumb, cascading tier select dropdowns, linked assets/controls/findings chips, diagram node links with Crosshair focus, review cadence, residual score inline L/I, and timestamps.
- **Filter bar**: status chips (All/Draft/Assessed/Treated/Accepted/Closed), treatment chips (All/Mitigate/Transfer/Avoid/Accept), text search (title, description, owner, tier labels), count display.
- **Next Review column** (renamed from Due Date): human-readable date, red text + "(overdue)" for past dates, orange text for dates within 14 days.
- **Focus Node**: Crosshair button dispatches `grc-focus-diagram-node` event, available in actions column and expanded detail per diagram link.
- **Simplified creation form**: Tier level toggle (Tier 2 / Tier 3) + risk title text field + Add button. Tier 4 operational risks are auto-generated from findings and do not appear in the creation form. New risks are assigned mid-range likelihood/impact scores by default; scoring is refined in the expanded detail row.
- **Tier-scoped detail editing**: Expanded detail shows only the tier selects relevant to the risk's level. Tier 2 risks show only the Tier 2 catalogue select. Tier 3 risks show Tier 2 + Tier 3 selects. Tier 4 risks show Tier 2 + Tier 3 selects plus a read-only Tier 4 chip (since Tier 4 is derived from findings). Tier linking flows upward only (T4→T3→T2→T1).
- Inherent scoring from configured risk model (likelihood × impact matrix). Likelihood and impact are editable inline in the table columns.
- Inline editing for title, owner, next review, treatment strategy, likelihood, impact, and status in table rows.
- Likelihood/impact inline selects recalculate inherent score on change.
- Colored severity chip badges on risk ratings.
- Delete risk with confirmation dialog.
- Risk deletion automatically cleans stale references from SoA, assessments/SRMP actions, workflow tasks, threat scenarios, governance documents, and finding linkedRiskIds.
- Optional threat actor assignment from the threat actor registry.
- Linked-control visibility per risk via SoA mappings.

### Compliance
- **Built-in framework catalog** with one-click addition of major control frameworks:
  - 11 frameworks across three categories: Compliance Standards, Threat Frameworks, Government/National Standards.
  - Available frameworks: NIST SP 800-53 Rev 5.1 (1,189 controls), OWASP Top 10 2021 (10), CSA CCM v4.0.10 (197), MITRE ATT&CK Enterprise v14.1 (820), MITRE ATT&CK ICS v14.1 (81), MITRE ATT&CK Mobile v14.1 (114), IEC 62443-3-3 (92), Australian ISM Dec 2025 (1,073), Essential Eight Oct 2024 (126), NIST CSF 2.0 (106, placeholder), ISO 27001:2022 (93, placeholder).
  - Each framework identified by version and release date (e.g. "NIST SP 800-53 Rev 5.1 - Sep 2020").
  - Selective loading: large frameworks (NIST 800-53, MITRE ATT&CK, CSA CCM, ISM) support family/tactic/domain checkboxes.
  - NIST 800-53 offers "Base Controls Only" toggle (322 base vs 1,189 total).
  - Duplicate detection warns when a framework name already exists in the workspace.
  - Placeholder entries for NIST CSF 2.0 and ISO 27001:2022 auto-activate when data files are placed in `server/data/security-knowledge-base/`.
- Control set import from CSV/XLSX.
- Multi-control-set tabbed view with per-set progress indicators (e.g. "NIST CSF 12/45").
- SoA scope selector dropdown (System or Diagram scope).
- Per-control fields:
  - Applicability
  - Implementation status
  - Linked risks (`mitigatesRiskIds`)
  - Justification
  - Evidence references
- MUI Dialog-based evidence entry (replaced `window.prompt()`).
- Delete control set with confirmation dialog.
- Delete individual evidence items.
- Tooltips on all columns and input fields.

### AI Analysis Panel
- Reuses the main analysis/chat experience while in GRC mode.
- Available on every GRC tab with responsive presentation:
  - Docked right panel on large viewports.
  - Toggleable overlay panel on constrained viewports.
- Uses the same right-edge dock/toggle pattern as Diagram mode.
- The panel can be hidden without unmounting chat state, so conversation context is preserved while navigating tabs.
- Includes full architecture diagram context plus optional GRC workspace context from `aiAssist` settings.
- Keeps answers focused on risk-to-control mapping, treatment actions, evidence gaps, workflow tasks, and assessment readiness.
- Supports both non-streaming and streaming chat via existing chat endpoints.

### Assessments
- Stepped assessment creation flow with section dividers (Details → Scope → Tier Filters → Link Risks).
- Cascading tier filter dropdowns from `tierCatalogue` (replacing free-text inputs).
- Tier 2/3/4 filters can be selected independently; parent tier selection is optional (options are narrowed when a parent is selected).
- Scoped assessment creation with multi-scope sets and optional risk overrides.
- Suggested-scope risk linking using scope item union + tier filter matching.
- Risk severity badges with color-coded chips in risk selection dropdowns.
- Assessment workspace editing organized into sections: Details & Ownership, Scope & Filters, Findings & Evidence, Threat Model & Attack Paths, Linkages, Export.
- Assessment workspace includes a "Related Findings" table derived from linked risks plus the active assessment tier filter.
- Findings do not store direct tier fields; they appear in an assessment when at least one linked risk matches the assessment's selected tier filter.
- Attack Path Diagram (simplified threat model canvas):
  - Import individual diagram nodes via dropdown.
  - Zone-based section import (by Security Zone) to pull related nodes/edges in one action.
  - "Import All" button to import every node and edge from the active diagram.
  - Click an edge to toggle it in/out of the attack path (red animated = in path).
  - Attack path ordering auto-determined by graph traversal (source→target chain walk).
  - Single "Attack Path Description" text area for describing the attack scenario.
- **Import Attack Paths from Diagram**: When the active diagram contains named attack paths (defined in the Attack Paths Panel), a dedicated import section appears in the Threat Model workspace:
  - Dropdown selector lists all named paths from the diagram (showing STRIDE category chip and risk level chip).
  - "Import Path" button auto-imports the selected path: `ensureCanvasNode` is called for each step's source and target nodes (find-or-create by `diagramNodeId`), canvas edges are found by `diagramEdgeId` or created between the mapped canvas nodes, and an `AssessmentAttackPath` record is created with canvas-local IDs plus `diagramAttackPathId` back-reference.
  - Re-importing a path with the same `diagramAttackPathId` replaces the existing `AssessmentAttackPath` in place.
- **Named Attack Paths list**: Below the canvas, all imported `AssessmentAttackPath` objects are rendered as collapsible cards:
  - Collapsed header: STRIDE category chip (colour-coded), risk level chip, path name, step count, expand chevron.
  - Expanded card: ordered step list showing source → target for each step, with a Focus Edge button that navigates the mini-canvas to the corresponding edge; Remove Path button to delete the path record.
  - Paths persist in `GrcAssessment.threatModel.attackPaths` as `AssessmentAttackPath[]`.
- Node visuals in the canvas use the same icon-only style as the 2D diagram (`IconOnlyNode` mapping by node type).
- Double-click on a linked canvas node/edge switches to Diagram mode, forces 2D view, and focuses/selects the linked element.
- The attack path diagram intentionally excludes scoring and heat-map logic.
- Inline assessment status updates and linkage to risks/compliance gaps/tasks.
- Auto-link workflow tasks that reference the active assessment.
- Delete assessment with confirmation dialog.
- Assessment report context now includes linked assets (derived from linked risks/tasks) with domain/category/business/security criticality.
- Assessment report exports include threat model node/connection counts, attack-path traversal steps, and attack path description.
- Optional threat actor multi-select for assessment scope.
- Linked implemented controls via multi-select to reference mitigating controls deployed within the assessment scope.
- Linked initiatives via multi-select to reference initiatives that justify risk acceptance or strategic treatment decisions.
- Scope-aware report context includes scope set and tier filter summary.
- Report export in PDF, TXT, and HTML formats.
- Tooltips on all form fields and workspace inputs.
- Performance optimization: only the active GRC tab is mounted/rendered; hidden tabs are unmounted to reduce background render cost.

### Risk Management Plan
- Dedicated tab for assessment-bound SRMP authoring.
- One plan per assessment (no standalone plan objects).
- Plan fields: objective, strategy, residual statement, monitoring, communication, review cadence.
- Action register per plan with owner/due/status/notes and linked risks.
- Open plan actions can be converted to workflow tasks.
- Tooltips on all plan fields and action form fields.

### Governance
- Document registry for policies, processes, SOPs, guidelines, standards, and other governance documents.
- Metadata-only storage: title, type, description, owner, version, review dates, status, tags.
- External document links (file shares, SharePoint, web URLs) that open on click.
- Cross-linkages to risks, control sets, and assessments.
- Filtering by document type, status, and text search.
- Inline editing for all document fields in the table.
- Delete document with confirmation dialog.
- Tooltips on all form inputs and table columns.

### Threat Profiles
- Threat actor registry:
  - Actor types: nation state, organised crime, insider, hacktivist, opportunistic, competitor, supply chain.
  - Capability level (1–5) and resource level (very low to very high).
  - Motivation, description, targeted assets (multi-select from asset register), and free-text tags.
  - Filterable table by type and minimum capability level.
  - Inline editing for all fields; delete with confirmation.
- Threat scenario documentation:
  - Actor linkage, targeted assets, MITRE ATT&CK technique tags (chip input), linked risks (multi-select).
  - Narrative likelihood and impact fields.
  - Filterable table by linked actor.
  - Inline editing for all fields; delete with confirmation.
- Empty states with instructional guidance for both sections.
- Tooltips on all form inputs and table columns.

### Third Parties
- Third-party vendor/supplier risk register.
- Table layout with configurable columns via `useTableColumnConfig` + `TableColumnConfigPopover`.
- 11 columns: Name, Category, Status, Risk Rating, Data Classification, Contact, Contract Expiry, Next Review, Linked Assets, Linked Risks, Actions.
- Sortable columns with `TableSortLabel` headers.
- Expandable detail rows with 2-column grid: description, category, status, risk rating, data classification, contact name/email, contract expiry, last assessment date, next review date, linked assets (clickable chips → switch to assets tab), linked risks, notes.
- Category chip filters and status chip filters.
- Text search across name, description, contact name, contact email, and notes.
- Categories: cloud provider, SaaS, managed service, contractor, supplier, partner, other.
- Status lifecycle: active, under review, onboarding, offboarding, terminated.
- Risk rating: critical, high, medium, low, not assessed.
- Data classification: public, internal, confidential, restricted.
- Asset linking via multi-select from asset register with chip display.
- Risk linking via multi-select from risk register with chip display.
- Inline add form with name, category, status, risk rating, data classification, contact, and email.
- Delete with confirmation dialog.
- Empty state with instructional guidance.
- Tooltips on all form inputs and table columns.

### Security Initiatives
- Strategic security improvement program register.
- Table layout with configurable columns via `useTableColumnConfig` + `TableColumnConfigPopover`.
- 9 columns: Title, Category, Status, Priority, Owner, Target Date, Progress, Linked Risks, Actions.
- Sortable columns with `TableSortLabel` headers.
- Expandable detail rows with 2-column grid: description, current state narrative, target state narrative, category, status, priority, owner, executive sponsor, start/target/completed dates, linked risks (clickable chips → switch to risks tab), linked control sets (clickable chips → switch to compliance tab), linked assets (clickable chips → switch to assets tab), linked assessments (clickable chips → switch to assessments tab), milestones sub-table, progress bar, notes.
- Category chip filters (uplift, remediation, compliance, transformation, hardening, other) and status chip filters (proposed, approved, in_progress, on_hold, completed, cancelled).
- Text search across title, description, owner, sponsor, current state, and target state.
- Categories: uplift, remediation, compliance, transformation, hardening, other.
- Status lifecycle: proposed → approved → in_progress → on_hold → completed/cancelled.
- Priority levels: critical, high, medium, low.
- Milestone management within expanded detail:
  - Nested sub-table with title, status, due date, owner.
  - Add/edit/delete milestones inline.
  - Milestone statuses: pending, in_progress, completed, skipped.
  - Progress bar (`LinearProgress`) derived from completed/total milestones.
- Risk linking via multi-select from risk register with chip display.
- Control set linking via multi-select from loaded control sets with chip display.
- Asset linking via multi-select from asset register with chip display.
- Assessment linking via multi-select from assessment register with chip display.
- Inline add form with title, category, priority, owner.
- Delete with confirmation dialog.
- Empty state with instructional guidance.
- Tooltips on all form inputs and table columns.

### Implemented Controls
- Registry of implemented security mechanisms (technologies, tools, policies, and processes).
- Each control links to SoA entries it satisfies, risks it mitigates, assets it protects, and assessments that evaluate its effectiveness.
- Table layout with configurable columns via `useTableColumnConfig` + `TableColumnConfigPopover`.
- Sortable columns with `TableSortLabel` headers.
- Expandable detail rows with description, vendor/product/version, dates, linkage chips, and notes.
- Control type filter: technical, administrative, physical, operational.
- Category filter: 13 categories (access control, network security, endpoint protection, data protection, identity management, monitoring/logging, incident response, vulnerability management, encryption, backup/recovery, physical security, policy/procedure, training/awareness).
- Status filter: active, planned, under review, deprecated, inactive.
- Automation level tracking: manual, semi-automated, fully automated.
- Vendor, product, and version fields for tool/product identification.
- Implemented date, last review date, and next review date with overdue-for-review highlighting.
- Linked SoA entries, linked risks, linked assets, and linked assessments via multi-select with clickable chips.
- Text search across title, description, owner, vendor, and product.
- Inline add form with title, type, category, status, automation level, and owner.
- Delete with confirmation dialog.
- Empty state with instructional guidance.
- Tooltips on all form inputs and table columns.
- CSV export.

### Dashboard
- Summary metrics for assets, risks, SoA coverage, assessments, tasks, governance documents, third parties, and security initiatives.
- Asset domain distribution and high business/security critical asset counts.
- Highest-severity risk count is derived from the top configured rating bands.
- Risk distribution visualization.
- SRMP metrics: assessments with plans and open plan action counts.
- Governance document metrics: total count and active count.
- Threat profile metrics: actor count and scenario count.
- Third-party metrics: total count and high/critical risk count.
- Security initiative metrics: total count, active count, and overdue count.
- Implemented control metrics: total count, active count, and overdue-for-review count.
- Appetite breach metrics: count of risks whose resolved appetite threshold is exceeded, highlighted in red when > 0.
- Findings metrics: total count, open count, critical/high count.

### Reporting
- **Metrics Snapshot**: 12 KPI cards (assets, risks, high/critical risks, findings, open findings, SoA entries, implemented controls, open tasks, overdue tasks, appetite breaches, assessment coverage %, governance documents).
- **Custom Chart Builder**:
  - User-defined charts from any GRC data source, rendered inline in a responsive 3-column grid between Metrics Snapshot and built-in Analytics.
  - "Add Chart" button opens a dialog-based builder (`CustomChartBuilderDialog`).
  - Builder dialog workflow:
    1. Select data source (11 options: risks, assets, findings, tasks, third parties, governance docs, threat actors, SoA entries, assessments, threat scenarios, appetite rules).
    2. Select primary group-by field (dropdown populates from the selected data source's groupable fields).
    3. Select chart type via 3×3 visual card picker (bar, horizontal bar, pie, donut, stacked bar, line, area, radar, treemap).
    4. Conditional fields:
       - Stacked bar → secondary group-by field (same source, excluding primary).
       - Line/area → time granularity selector (week, month, quarter).
    5. Chart title (auto-generated from data source + field labels, user-editable once manually modified).
    6. Color scheme selector (5 clickable swatch strips: default, severity, cool, warm, monochrome).
  - Validation: data source + group-by + chart type + title required; stacked bar requires secondary group-by; line/area requires time granularity.
  - Edit button re-opens the dialog pre-populated with existing config.
  - Delete button removes the chart.
  - Maximum 20 custom charts enforced (Add button disables at limit).
  - Charts persist in `workspace.config.customCharts` via `applyWorkspace()`.
  - Rendering (`CustomChartRenderer`):
    - Data source registry (`CHART_DATA_SOURCE_REGISTRY`): 11 data sources, each with typed field descriptors (`fieldKey`, `label`, `accessor`, optional `colorMap`).
    - Groupable fields per source:
      - risks: status, ratingLabel, treatmentStrategy, owner.
      - assets: domain, category, owner, businessCriticality, securityCriticality.
      - findings: severity, status, type, source, owner.
      - workflowTasks: status, priority, type, owner.
      - thirdParties: riskRating, category, status, dataClassification.
      - governanceDocuments: status, type, owner.
      - threatActors: type, resourceLevel.
      - soaEntries: applicability, implementationStatus, scopeType.
      - assessments: status, owner.
      - threatScenarios: likelihood, impact.
      - appetiteRules: scopeAssetDomain.
    - 5 color schemes (`COLOR_SCHEMES`): default (blue/purple/pink palette), severity (red→green→gray), cool (blue/indigo/cyan), warm (red/orange/amber), monochrome (gray scale).
    - Time-bucketing helper for line/area charts: parses `createdAt`, buckets into week/month/quarter, returns sorted time series with optional multi-series from secondary grouping.
    - 9 chart types rendered via Recharts:
      - `bar`: `BarChart` + `Bar` + `XAxis`(category) + `YAxis`(number).
      - `horizontal_bar`: `BarChart` layout="vertical".
      - `pie`: `PieChart` + `Pie` (outerRadius only).
      - `donut`: `PieChart` + `Pie` (innerRadius=40).
      - `stacked_bar`: `BarChart` + multiple `Bar` stackId="a" from secondary grouping.
      - `line`: `LineChart` + `Line`(s) from time series.
      - `area`: `AreaChart` + `Area`(s) from time series.
      - `radar`: `RadarChart` + `PolarGrid` + `PolarAngleAxis` + `Radar`.
      - `treemap`: `Treemap` with labeled rectangles.
    - All charts in `ResponsiveContainer width="100%" height={220}`.
    - Empty data sources display "No data" placeholder.
    - Color maps on field descriptors (severity, status, implementation, priority) apply semantic colors when available; palette fallback otherwise.
- **Built-in Analytics**: 10 pre-configured charts (risk rating distribution, risk status, asset domains, finding severity, finding status, task status & priority, control implementation, third-party risk ratings, governance document status, threat actor types).
- **Framework Coverage**: Per-control-set progress bars with implementation/applicability chip breakdowns.
- **Report Catalog**: 8 report templates with configurable section visibility, ordering, reset, preview, and HTML download.
- **CSV Data Exports** (collapsible):
  - Assets, Risks, SoA, Tasks, Plans, Threat Profiles, Appetite Rules, Governance Docs, Findings, Third Parties, Initiatives, Implemented Controls.
- Assets CSV includes domain/category and business/security criticality.

## Service Layer
`src/services/GrcWorkspaceService.ts` provides:
- Workspace defaults + normalization for the current GRC schema.
- Assessment threat-model normalization (`GrcAssessment.threatModel` nodes/edges/source refs).
- Risk matrix/scoring/rescoring.
- Diagram asset sync utilities.
- Diagram-linked context aggregation (`buildDiagramGrcContext`).
- Prompt-safe GRC context assembly for AI chat (`buildGrcPromptContext`) using `aiAssist` controls.
- Dashboard metrics and workflow health computations.
- CSV exporters (`assets`, `risks`, `soa`, `tasks`, `plans`, `threatProfiles`, `appetiteRules`, `findings`, `thirdParties`, `initiatives`, `implementedControls`).
- Per-risk appetite resolution via scoped appetite rules (`resolveRiskAppetite`).
- Gap-driven task generation (unmitigated risks, missing evidence, appetite breaches, governance review overdue, third-party review overdue, control review overdue).
- Tier 3 (including Risk ID/Name/Statement format) + control set parsing and import conversion.
- Assessment scope resolution and zone-based assessment lookup helpers.
- Findings sync from rule engine (`syncFindingsFromRuleEngine`) with category-to-type/severity mapping and auto-asset linking.

## Backend API Surface
Routes mounted at `/api/grc` from `server/routes/grcRoutes.js`.

Implemented:
- `GET /api/grc/metadata`
- `POST /api/grc/score-risk`
- `POST /api/grc/report/summary`
- `POST /api/grc/report/charts`
- `POST /api/grc/import/tier3-catalogue/preview`
- `POST /api/grc/import/tier3-catalogue`
- `POST /api/grc/import/control-set/preview`
- `POST /api/grc/import/control-set`
- `GET /api/grc/frameworks/catalog` — returns built-in framework catalog metadata with `dataFileAvailable` flag (auto-detected from filesystem).
- `POST /api/grc/frameworks/load` — loads a built-in framework by key, transforms its data file into `GrcControlSet` + seeded `GrcSoaEntry[]`. Accepts `{ frameworkKey, selectedFamilies?, baseControlsOnly?, scopeType, scopeId }`. Per-framework transformation functions handle the varying JSON schemas (NIST 800-53, OWASP, CSA CCM, MITRE ATT&CK, IEC 62443, ISM, Essential Eight, generic fallback).

Frontend API bindings are in `src/api.ts` (`fetchFrameworkCatalog`, `loadBuiltInFramework`).

GRC AI behavior in this iteration:
- No dedicated `/api/grc/ai/*` routes are used.
- GRC AI analysis is routed through existing chat endpoints (`/api/chat`, `/api/chat/stream`) with additional GRC context.

## Control Set Import Behavior
- CSV and XLSX import paths supported.
- XLSX is parsed server-side using ZIP/XML extraction.
- Imported controls seed SoA entries with the requested scope (`scopeType`, `scopeId`).
- Name-collision merge policy keeps latest imported set per logical name.
- Local CSV parser fallback remains available when API parsing fails.

## Example Workspace Coverage
`src/data/exampleSystems/vulnerableWebAppGrc.ts` is updated to exercise:
- Risks linked to controls through SoA.
- System-scope and diagram-scope SoA entries.
- Implemented controls with and without evidence.
- Workflow tasks across statuses/types.
- Assessment scope-item/tier-filter workflows with embedded SRMP data.
- Governance documents across types (policy, procedure, SOP, guideline) with cross-linkages to risks, control sets, and assessments.
- Threat actors (organised crime, hacktivist, insider, opportunistic, supply chain) linked to assets and risks.
- Threat scenarios with MITRE ATT&CK technique references linked to actors, assets, and risks.
- Scoped appetite rules (mission-critical assets, cyber risk tier, OT domain, application data protection).
- Security initiatives with milestones (authentication uplift, data encryption remediation) linked to risks, control sets, assets, and assessments.
- 5 sample implemented controls (WAF, MFA, SIEM, encryption at rest, security awareness training) linked to SoA entries, risks, assets, and assessments.

## Component Interrelation Model

This section describes how every GRC entity type links to every other, the direction of those links, and the lifecycle expectations.

### Entity Relationship Map

```
Diagram (nodes, edges, attack paths, security zones)
  │
  ├──▶ Assets            (sync from diagram nodes; asset.diagramRefs[].nodeId)
  │      │
  │      ├──▶ Risks       (risk.assetIds[] ← asset linkage)
  │      ├──▶ Threat Actors (actor.targetedAssetIds[])
  │      ├──▶ Threat Scenarios (scenario.targetedAssetIds[])
  │      ├──▶ Third Parties (thirdParty.linkedAssetIds[])
  │      ├──▶ Implemented Controls (control.linkedAssetIds[])
  │      └──▶ Security Initiatives (initiative.linkedAssetIds[])
  │
  ├──▶ Findings           (rule engine sync or manual; finding.relatedNodeIds[])
  │      │
  │      ├──▶ Risks       (finding.linkedRiskIds[] + risk.sourceFindingId)
  │      └──▶ Tasks       (finding.linkedTaskIds[] + task.sourceFindingId)
  │
  └──▶ Attack Paths       (diagram-defined paths imported into assessments)

Risks
  ├──▶ SoA Entries         (soaEntry.mitigatesRiskIds[] — controls that treat this risk)
  ├──▶ Assessments         (assessment.riskIds[] — risks in scope for the assessment)
  ├──▶ Workflow Tasks      (task.riskId — treatment/remediation tasks)
  ├──▶ Threat Scenarios    (scenario.linkedRiskIds[])
  ├──▶ Governance Docs     (document.linkedRiskIds[])
  ├──▶ Threat Actors       (risk.threatActorIds[] — attribution)
  ├──▶ Security Initiatives (initiative.linkedRiskIds[])
  └──▶ Appetite Rules      (resolved per-risk via specificity-ranked matching)

Assessments
  ├──▶ Risks               (assessment.riskIds[])
  ├──▶ SRMP / Actions      (assessment.riskManagementPlan.actions[].linkedRiskIds[])
  ├──▶ Implemented Controls (assessment.linkedImplementedControlIds[])
  ├──▶ Security Initiatives (assessment.linkedInitiativeIds[])
  ├──▶ Threat Actors        (assessment.threatActorIds[])
  ├──▶ Threat Model Canvas  (assessment.threatModel — nodes/edges from diagram import)
  └──▶ Attack Paths         (assessment.threatModel.attackPaths[] — imported from diagram)

Compliance (Control Sets + SoA)
  ├──▶ Risks               (soaEntry.mitigatesRiskIds[])
  ├──▶ Evidence             (soaEntry.evidence[])
  ├──▶ Governance Docs      (document.linkedControlSetIds[])
  ├──▶ Implemented Controls (implControl.linkedSoaEntryIds[])
  └──▶ Assessments          (document.linkedAssessmentIds[])

Governance Documents
  ├──▶ Risks               (document.linkedRiskIds[])
  ├──▶ Control Sets         (document.linkedControlSetIds[])
  └──▶ Assessments          (document.linkedAssessmentIds[])

Third Parties
  ├──▶ Assets              (thirdParty.linkedAssetIds[])
  └──▶ Risks               (thirdParty.linkedRiskIds[])

Security Initiatives
  ├──▶ Risks               (initiative.linkedRiskIds[])
  ├──▶ Control Sets         (initiative.linkedControlSetIds[])
  ├──▶ Assets              (initiative.linkedAssetIds[])
  ├──▶ Assessments          (initiative.linkedAssessmentIds[])
  └──▶ Milestones           (initiative.milestones[] — nested progress tracking)

Implemented Controls
  ├──▶ SoA Entries          (implControl.linkedSoaEntryIds[])
  ├──▶ Risks               (implControl.linkedRiskIds[])
  ├──▶ Assets              (implControl.linkedAssetIds[])
  └──▶ Assessments          (implControl.linkedAssessmentIds[])

Workflow Tasks
  ├──▶ Risk                (task.riskId)
  ├──▶ Assessment           (task.assessmentId)
  ├──▶ Asset               (task.assetId)
  ├──▶ Control Set + Control (task.controlSetId + task.controlId)
  ├──▶ Source Finding        (task.sourceFindingId)
  └── generated from gaps   (unmitigated risks, missing evidence, appetite breaches,
                              governance/TPRM/control review overdue)
```

### Referential Integrity on Deletion

When an entity is deleted, stale references are automatically cleaned from all linked entities:

| Deleted Entity | Cleaned From |
|---|---|
| Asset | risks (assetIds), threat actors (targetedAssetIds), threat scenarios (targetedAssetIds), workflow tasks (assetId) |
| Risk | SoA entries (mitigatesRiskIds), assessments (riskIds), SRMP actions (linkedRiskIds), workflow tasks (riskId), threat scenarios (linkedRiskIds), governance docs (linkedRiskIds), findings (linkedRiskIds) |
| Assessment | (standalone — no reverse linkage cleanup required in current model) |
| Finding | risks (sourceFindingId → cleared), tasks (sourceFindingId → cleared) |
| Governance Doc | (standalone — no reverse linkage cleanup required in current model) |
| Third Party | (standalone — no reverse linkage cleanup required in current model) |
| Implemented Control | (standalone — no reverse linkage cleanup required in current model) |
| Security Initiative | (standalone — no reverse linkage cleanup required in current model) |
| Workflow Task | (standalone — no reverse linkage cleanup required in current model) |

### Tier Taxonomy Model

The four-tier risk taxonomy flows **upward** (T4→T3→T2→T1):

| Tier | Purpose | Source | Editable in Risk Detail |
|---|---|---|---|
| **Tier 1** | Enterprise-level risk domain | Auto-set from catalogue root (e.g. "Enterprise Risk") | No (inherited) |
| **Tier 2** | Board-level risk categories | User-selected from catalogue or set at creation | Yes — dropdown select |
| **Tier 3** | Named risk scenarios | User-selected from catalogue or set at creation | Yes — dropdown select (filtered by T2 parent) |
| **Tier 4** | Operational evidence | Auto-derived from linked findings | Read-only chip display |

Risk creation form offers Tier 2 or Tier 3 toggle. Tier 4 risks are generated automatically when findings are linked to risks via `sourceFindingId`.

## Expected Workflow

### End-to-End Operating Sequence

This is the recommended operating flow. Steps can be performed in any order, but the sequence below ensures each step has the data it needs.

**Phase 1 — Foundation**

1. **Configuration** (Workflow & Config tab): Set risk model scales, rating bands, global appetite threshold, default statuses/strategies, asset categories, assessment scope types, and AI assist context preferences.

2. **Risk Statements** (Workflow & Config → Risk Statements): Author or import the tier taxonomy — Tier 1 domain, Tier 2 board-level categories, Tier 3 named risk scenarios. Tier 4 is populated from findings.

3. **Risk Appetite** (Workflow & Config → Risk Appetite): Define scoped appetite rules that override the global threshold by asset domain, risk tier, and/or asset criticality.

**Phase 2 — Asset & Threat Identification**

4. **Diagram**: Build or update the system architecture diagram in Diagram mode. Define security zones, data flows, and named attack paths.

5. **Assets** (Assets tab): Sync assets from diagram nodes. Classify each by domain, category, and business/security criticality.

6. **Findings** (Findings tab): Sync rule-engine findings from diagram analysis or create manual findings. Classify by type, severity, and STRIDE category. Link findings to assets.

7. **Threat Profiles** (Threat Profiles tab): Register threat actors with capability/resource levels. Document threat scenarios with MITRE ATT&CK techniques, targeted assets, and linked risks.

**Phase 3 — Risk Assessment**

8. **Risks** (Risks tab): Quick-create Tier 2 or Tier 3 risks using the toggle + title form. Expand each row to refine tier classification, set likelihood/impact scores, assign owner and review date, link to assets, assign threat actors, and set treatment strategy. Create risks from findings to establish Tier 4 linkage.

9. **Assessments** (Assessments tab): Create scoped assessments with scope items and tier filters. Link risks to the assessment scope. Import attack paths from the diagram. Build the threat model canvas.

10. **Risk Management Plans** (Risk Management Plan tab): Author assessment-bound SRMPs with objectives, strategies, and action registers. Link plan actions to risks. Convert actions to workflow tasks.

**Phase 4 — Control & Treatment**

11. **Compliance** (Compliance tab): Import control frameworks or create custom control sets. Map SoA entries to risks they mitigate. Set applicability, implementation status, and attach evidence.

12. **Implemented Controls** (Implemented Controls tab): Register deployed security mechanisms. Link to SoA entries, risks, assets, and assessments. Track review dates.

13. **Governance** (Governance tab): Register policies, procedures, SOPs, and guidelines. Link to risks, control sets, and assessments. Track review dates and versions.

14. **Third Parties** (Third Parties tab): Register vendors and suppliers. Assess risk rating, data classification, and contract terms. Link to assets and risks.

15. **Security Initiatives** (Initiatives tab): Plan strategic improvement programs. Define milestones, link to risks/controls/assets/assessments. Track progress through the milestone lifecycle.

**Phase 5 — Monitoring & Reporting**

16. **Workflow Tasks** (Workflow & Config → Task Board): Monitor generated gap tasks (unmitigated risks, missing evidence, appetite breaches, overdue reviews). Create manual tasks linked to specific entities. Track through the task lifecycle.

17. **Dashboard** (Dashboard tab): Monitor KPI metrics, risk distribution, appetite breaches, task health, and coverage indicators.

18. **Reporting** (Reporting tab): Review metrics snapshot, build custom charts, export CSV data, and generate assessment reports in PDF/HTML/TXT.

### Operational Cadence

| Cadence | Activities |
|---|---|
| **Weekly** | Review open tasks, check for overdue reviews, update risk statuses, review new findings |
| **Monthly** | Reassess risk scores, update treatment plans, review SoA implementation progress, check appetite breaches, review initiative milestones |
| **Quarterly** | Full assessment cycle, update governance documents, review third-party risk ratings, executive reporting |
| **Incident-driven** | Create findings from incident, escalate to risks, generate treatment tasks, update threat profiles |

## Known Constraints
- No org-level RBAC or collaborative approval workflows yet.
- No external DB-backed persistence yet.
- No binary evidence blob storage.
- Dedicated GRC AI endpoints remain intentionally removed; chat API is the shared analysis surface.

## Related Docs
- `docs/GRC-User-Guide.md` (comprehensive operational guide)
- `docs/GRC-Open-Source-Adoption-Matrix.md` (license-safe OSS adoption strategy)
- `docs/GRC-Module-Reference.md` (this technical reference)
