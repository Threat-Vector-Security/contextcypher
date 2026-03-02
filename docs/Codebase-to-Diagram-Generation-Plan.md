# Codebase to Diagram Generation Plan

## Objective
Create a new pipeline that converts source code and/or a full application repository into a ContextCypher `ExampleSystem` diagram, with support for:

1. Non-AI deterministic generation (privacy-first, repeatable)
2. Optional AI-enhanced enrichment (higher semantic quality)
3. A hybrid mode that combines both

## Current Baseline (From Existing System)
The current platform already has strong pieces we can reuse:

1. `src/services/DiagramGenerationService.ts`: context-to-diagram generation (AI-driven).
2. `src/services/DiagramImportService.ts`: local parsing + optional AI conversion with privacy controls.
3. `src/components/ImportOptionsDialog.tsx`: local vs AI UX and consent/sanitization pattern.
4. `src/types/ExampleSystemTypes.ts` and `src/types/SecurityTypes.ts`: target schema and valid node/zone types.

Gap: there is no dedicated code/project analyzer that extracts architecture directly from source files.

## Can This Be Done Without AI?
Yes. A meaningful and useful architecture diagram can be generated without AI by combining static analysis + deterministic rules.

What works well without AI:

1. Service/module discovery (folders, manifests, entrypoints).
2. API route extraction (Express/Fastify/Nest patterns).
3. Dependency mapping (imports, package deps, DB/queue SDK usage).
4. Infra parsing (Docker Compose, Kubernetes YAML, Terraform, OpenAPI).
5. Security signal extraction (TLS usage, auth middleware, secrets handling patterns).

What is harder without AI:

1. Business intent inference from ambiguous code.
2. Implicit runtime relationships (reflection, dynamic imports, plugin loading).
3. Clean naming/semantic grouping for large repos.

Conclusion: non-AI is viable for an MVP and should be the default foundation.

## Recommended Strategy
Use a hybrid architecture:

1. Deterministic extractor builds a factual graph from code (source of truth).
2. Optional AI step enriches labeling/grouping/zone confidence and fills soft gaps.
3. Final validator enforces schema, connectivity, and safety constraints before diagram creation.

This keeps privacy and repeatability while still enabling higher-quality diagrams when AI is enabled.

## Proposed Architecture

### 1) Repository Ingestion
Inputs:

1. Uploaded zip/tar of a project
2. Folder scan (local desktop/dev mode)
3. Selected manifest files only (quick mode)

Rules:

1. Never execute project code.
2. Ignore heavy/generated folders by default (`node_modules`, `dist`, `build`, `.git`).
3. Enforce max size/file count limits.

### 2) Deterministic Extraction Engine
Create a new backend service (example: `server/services/codeDiagram/`):

1. `ProjectScanner`: file discovery + language/framework detection.
2. `ArtifactParsers`: language/config parsers (TS/JS first).
3. `FactGraphBuilder`: normalized intermediate graph with evidence per edge/node.
4. `RuleMapper`: map facts to ContextCypher node types, zones, and edge metadata.

### 3) Intermediate Representation (IR)
A stable internal graph model before conversion:

1. `components` (id, kind, tech, repoPath, confidence, evidence[])
2. `interfaces` (HTTP routes, events, DB access, queues)
3. `trustBoundaries` (internet-facing, internal, data, management)
4. `relationships` (calls, data flows, control flows)

### 4) Diagram Conversion
Convert IR to `ExampleSystem`:

1. Reuse existing node type and zone validators.
2. Reuse layout logic patterns from import/generation services.
3. Attach `customContext` as a generated architecture summary and evidence index.

### 5) Optional AI Enrichment Layer
Mode toggle: `local` | `hybrid` | `ai`

1. `local`: deterministic only.
2. `hybrid`: send extracted facts/IR (not raw full code by default) for enrichment.
3. `ai`: allow broader summarization if user explicitly opts in.

Reuse the same privacy consent and sanitization UX pattern used by diagram import.

## Phased Implementation Plan

### Phase 0: Design and Contracts
Deliverables:

1. Define IR schema.
2. Define quality metrics.
3. Add endpoint contract (example: `POST /api/generate-diagram-from-code`).

### Phase 1: Deterministic MVP (No AI)
Scope:

1. TypeScript/JavaScript monorepo support first.
2. Parse `package.json`, imports, Express route patterns, DB client usage, queue usage.
3. Basic zone inference rules: internet-facing routes -> `DMZ`/`Internet`, service internals -> `Internal`, DB/storage -> `Restricted`/`Critical`.
4. Generate `ExampleSystem` with confidence and warnings.

Success criteria:

1. Produces valid diagrams for representative repos.
2. No AI dependency.
3. Runtime within practical limits (example target: <60s on medium repo).

### Phase 2: Whole-Project Coverage
Add config/infra analyzers:

1. `docker-compose.yml`, Dockerfiles
2. Kubernetes manifests/Helm values
3. Terraform (resource-level mapping)
4. OpenAPI/AsyncAPI specs

Add cross-source merge logic so code + infra become one architecture graph.

### Phase 3: Hybrid AI Enrichment
Add optional enrichment pass:

1. Better node naming/grouping for readability.
2. Better trust-boundary suggestions.
3. Gap detection (possible missing controls, unlabeled data flows).

Hard rule: AI cannot introduce invalid node/zone types; deterministic validator remains final authority.

### Phase 4: UX and Refinement Loop

1. New import flow option: "Generate from Codebase".
2. Show evidence and confidence per generated component.
3. Let users accept/reject suggested merges and zone placements.
4. Feed user corrections back into deterministic rule tuning.

## Validation Plan Using `vulnerableAppArchitecture`
Use `src/data/exampleSystems/vulnerableAppArchitecture.ts` as a benchmark fixture:

1. Build a test corpus that contains equivalent app layers and flows.
2. Evaluate structural similarity (component categories, core edges, zone placement).
3. Compare extracted metadata quality (vendor/version/protocol/security controls).

Target is not exact coordinate parity; target is architecture fidelity and threat-model usefulness.

## Key Risks and Mitigations

1. Risk: false positives from heuristic parsing.
   Mitigation: evidence-backed scoring + confidence thresholds + user review.
2. Risk: very large repositories.
   Mitigation: staged scanning, folder filters, and progressive generation.
3. Risk: privacy concerns with AI.
   Mitigation: deterministic default, explicit consent, sanitization, local AI option.
4. Risk: language/framework variance.
   Mitigation: plugin parser architecture and phased language rollout.

## Practical Recommendation
Ship in this order:

1. Deterministic JS/TS MVP first (high control, low risk, immediate value).
2. Add infra parsers for whole-application visibility.
3. Add hybrid AI enrichment as optional quality booster.

This gives a strong no-AI baseline while still supporting AI-assisted depth when desired.
