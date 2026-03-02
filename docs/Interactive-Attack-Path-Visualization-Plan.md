# Interactive Attack Path Visualization (Implemented)

## Scope
This document describes the current implementation of interactive attack-path support in the diagram + GRC workflow.

The implemented approach is intentionally simple:
- Represent attack paths directly from existing diagram edges and nodes.
- Do not create synthetic nodes/edges for attack modeling.
- Do not use scoring heatmaps in this workflow.

## Implemented Data Model

### Diagram attack paths
Defined in `src/types/GrcTypes.ts`:
- `DiagramAttackPath`
- `DiagramAttackPathStep`
- `AttackPathRiskLevel`

A path stores:
- `id`, `name`, `strideCategory`, `riskLevel`, `description`
- ordered `steps[]` where each step references existing `edgeId`, `sourceNodeId`, `targetNodeId`

### Threat model user state
Defined in `src/types/ManualAnalysisTypes.ts`:
- `MitigationStatus`
- `StrideApplicability`
- `StrideElementOverride`
- `ThreatModelUserState`

This stores analyst decisions independent of rule detection:
- mitigation status/notes by finding
- STRIDE applicability overrides by element

## Diagram Editor Integration

### Attack Paths panel
`src/components/diagram/AttackPathsPanel.tsx` provides:
- create/select/delete attack path
- set STRIDE category and risk level
- edit description
- build path by clicking existing diagram edges
- auto-order steps by graph traversal

### Edge highlighting
The three edge renderers support attack-path highlighting:
- `src/components/edges/EditableSecurityEdge.tsx`
- `src/components/edges/SimpleEditableEdge.tsx`
- `src/components/edges/QuadraticEdge.tsx`

When an edge is part of the selected attack path, it is rendered as highlighted (red/animated) via `data.inAttackPath`.

### Save/load and snapshot
Attack paths and user state persist in diagram JSON:
- `attackPaths`
- `threatModelUserState`

`DiagramContextSnapshot` also carries `attackPaths` for downstream GRC/assessment consumption.

## Manual Analysis Integration

`src/services/ManualAnalysisService.ts` accepts `attackPaths` input and adds deterministic attack-path checks:
- `AP-001`: trust-boundary crossing without auth
- `AP-002`: sensitive path flow without encryption
- `AP-003`: low-trust to high-trust traversal without validation

`src/data/manualRuleCatalog.ts` includes AP rule metadata and STRIDE references.

## Threat Modeling Workbench (Manual Findings Window)

`src/components/ManualFindingsWindow.tsx` is implemented as a 4-tab workbench:

1. Findings
- Existing per-element findings explorer
- Mitigation controls per finding:
  - status select
  - analyst notes
- Direct focus actions to nodes/edges/zones

2. STRIDE Matrix
- Rows: DFD elements + data flows
- Columns: S/T/R/I/D/E
- Applicability based on element type:
  - process: all STRIDE
  - data store: T/I/D
  - actor: S/R/E
  - data flow: T/I/D
- Shows findings linkage and current state color
- Supports per-cell analyst override (`applicable/not_applicable/mitigated/accepted`)
- Cell actions can jump back to Findings tab for the selected element

3. Attack Paths
- Read-only review of diagram-defined paths
- Shows name, STRIDE, risk, step count, and ordered traversal
- Lists related `attackpath` findings and mitigation progress summary

4. Methodology
- STRIDE 4-step progress dashboard
- PASTA 7-step progress dashboard
- Progress is computed from live diagram/findings/mitigation/path data

## Export Coverage

Text + HTML export from `ManualFindingsWindow` now includes:
- mitigation status per finding
- STRIDE matrix summary
- attack paths and ordered steps
- STRIDE and PASTA methodology progress

## UX Principles Applied
- Attack paths are constrained to real diagram topology.
- Visualization is representation-first, not score-first.
- Review and mitigation workflow stays in one workbench.
- Diagram focus and workbench context remain linked.

## Deferred / Next Phase
- Assessment-side import/edit UX for diagram attack paths can be expanded.
- Additional assessment report formatting can be layered on current exported model.
