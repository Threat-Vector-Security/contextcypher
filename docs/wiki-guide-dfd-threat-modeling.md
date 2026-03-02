# DFD Threat Modeling and the Non-AI Rule Engine

ContextCypher supports traditional Data Flow Diagram (DFD) elements for STRIDE threat modeling alongside its detailed component modeling. This guide covers the DFD node types, the hybrid DFD methodology, STRIDE analysis integration, the deterministic rule engine, and how findings flow into the GRC module.

---

## DFD and Hybrid Methodology Overview

ContextCypher offers two complementary approaches to threat modeling:

- **Pure DFD nodes** — Traditional DFD External Entities, Processes, Data Stores, and Trust Boundaries for formal STRIDE analysis.
- **Hybrid DFD categorisation** — Any existing node type (servers, databases, cloud services, OT components, etc.) is automatically assigned a DFD category, enabling STRIDE analysis on detailed architecture diagrams without manual reclassification.

You can use pure DFD nodes for high-level threat modeling, apply DFD categorisation to detailed nodes for STRIDE analysis at any level, mix both in the same diagram, and transition from abstract to detailed as your design matures.

---

## DFD Node Types

The four DFD node types are available in the **Node Toolbox** under the "Threat Modeling (DFD)" category.

### DFD External Entity (Actor)

Represents any external entity that interacts with your system.

**Examples:** Human users, mobile applications, REST APIs, Lambda functions, third-party services, IoT devices.

**Key Properties:**
- **Actor Type** — A user-defined description (e.g., "Mobile User", "Payment Gateway", "Admin Console", "IoT Sensor").
- **Trust Level** — trusted, untrusted, or partial.
- **Authentication** — The authentication method used.

**Applicable STRIDE threats:** Spoofing, Repudiation.

### DFD Process

Represents processing elements that transform data.

**Examples:** Applications, services, functions, microservices, business logic components.

**Key Properties:**
- **Process Type** — A user-defined description (e.g., "Auth Service", "Order Processing", "Data Validator", "API Handler").
- **Technology** — The implementation technology.
- **Security Controls** — Security measures applied.

**Applicable STRIDE threats:** All six — Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, Elevation of Privilege.

### DFD Data Store

Represents data storage locations.

**Examples:** Databases, file systems, cache systems, message queues, blob storage, configuration stores.

**Key Properties:**
- **Storage Type** — A user-defined description (e.g., "User Database", "Session Cache", "Log Files", "Config Store").
- **Encryption** — At rest, in transit, both, or none.
- **Data Classification** — The sensitivity level of stored data.

**Applicable STRIDE threats:** Tampering, Repudiation, Information Disclosure, Denial of Service.

### DFD Trust Boundary

Represents boundaries between different trust levels.

**Examples:** Network boundaries, process boundaries, machine boundaries, privilege boundaries, compliance perimeters.

**Key Properties:**
- **Boundary Type** — A user-defined description (e.g., "Internet Boundary", "Corporate Network", "DMZ Perimeter", "Container Boundary").
- **From Zone / To Zone** — The security zones this boundary bridges.
- **Controls at Boundary** — Security controls enforced at this boundary.

**Applicable STRIDE threats:** Spoofing, Elevation of Privilege.

---

## User-Defined Types

Unlike traditional threat modeling tools, ContextCypher allows you to define custom type descriptions on every DFD node. This means you can use domain-specific language that matches your organisation's terminology.

**Examples:**
- Instead of "API" → "Payment Processing Gateway"
- Instead of "Database" → "Customer PII Store"
- Instead of "User" → "Healthcare Provider"

These custom types are included in AI analysis context, so the AI understands your specific system when generating threat analysis.

---

## Adding DFD Nodes to Your Diagram

1. Open the **Node Toolbox** in the left sidebar.
2. Expand the **Threat Modeling (DFD)** category (below Security Zones).
3. Drag and drop DFD elements onto your diagram.
4. Double-click a node to open the Node Editor and fill in its properties.
5. Enter custom type descriptions in the text fields (Actor Type, Process Type, Storage Type, or Boundary Type).

### Connecting DFD Elements

- Use the regular connection tools to draw data flows between DFD nodes.
- Data flows are automatically analysed for security implications by the rule engine.
- Edge properties can include protocol, encryption status, data classification, and security controls.

### Mixing DFD with Detailed Nodes

You can use both DFD nodes and detailed component nodes in the same diagram:
- Start with high-level DFD elements for initial threat modeling.
- Replace DFD elements with specific component types (e.g., replace "DFD Process" with an nginx web server node) as your design matures.
- Use the hybrid DFD categorisation (described below) to retain STRIDE analysis on detailed nodes.

---

## Hybrid DFD Methodology

Every non-DFD node type in ContextCypher is automatically assigned a DFD category based on its component type. This means you get STRIDE threat applicability analysis on detailed architecture diagrams without any manual work.

### How It Works

1. **Automatic categorisation** — When you place a node on the diagram, it is auto-assigned a DFD category. For example, a `database` node is categorised as a "Data Store", a `firewall` is categorised as a "Process", and a `smartphone` is categorised as an "Actor".
2. **Manual override** — You can change the DFD category in the Node Editor if the automatic mapping isn't right for your context.
3. **Enhanced analysis** — Both the AI and the rule engine consider the node's specific type AND its DFD category when generating analysis.

### Using the Hybrid Features in the Node Editor

1. Double-click any non-DFD node to open the Node Editor.
2. Look for the **DFD Element Type** accordion section.
3. The **DFD Category** dropdown shows the current category, with the auto-assigned default noted below.
4. The **Applicable STRIDE threats** are displayed as colour-coded chips based on the effective category.
5. The **DFD Type** text field lets you add a descriptive label (e.g., set a `database` node's DFD Type to "Customer Data Repository"). Suggested types are shown as placeholder text based on the node type.

### Automatic Category Mappings

The mapping covers all 480+ node types in ContextCypher. Here are the key patterns:

**Actors (External Entities):**
user, smartphone, tablet, laptop, desktop, workstation, endpoint, voipPhone, hmi, sensor, kvm, serialConsole, environmentSensor, thinClient, notebookServer, c2Server, phishingServer, socWorkstation, forensicsWorkstation.

**Processes:**
server, application, firewall, router, switch, dns, loadBalancer, apiGateway, webServer, authServer, proxy, service, all cloud compute services (awsEC2, azureVM, gcpComputeEngine, etc.), all security tools (siem, soar, xdr, edr, waf, ids, ips, etc.), all OT controllers (plc, rtu, scadaServer, actuator, etc.), all AI/ML inference/pipeline components.

**Data Stores:**
database, cache, storage, vault, ldap, kms, logging, identity, secretsManager, all cloud storage/database services (awsS3, awsRDS, azureBlobStorage, gcpCloudStorage, etc.), backup systems, code repositories, threat feeds, log stores.

**Trust Boundaries:**
securityZone, awsVPC, azureVirtualNetwork, gcpVPC, ibmVPC.

Some physical infrastructure nodes (UPS, PDU, HVAC, fibre terminals) have no DFD category since they don't participate in data flows.

---

## STRIDE Threat Analysis with DFD

When you use DFD nodes or hybrid DFD categorisation, ContextCypher applies STRIDE methodology based on the DFD category. The applicable threats per category are:

| DFD Category | Applicable STRIDE Threats |
|---|---|
| **External Entity (Actor)** | Spoofing, Repudiation |
| **Process** | Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, Elevation of Privilege |
| **Data Store** | Tampering, Repudiation, Information Disclosure, Denial of Service |
| **Trust Boundary** | Spoofing, Elevation of Privilege |

### What This Means in Practice

**For External Entities (Actors):**
- **Spoofing** — Can the entity be impersonated? Is authentication strong enough?
- **Repudiation** — Can the entity deny actions they performed? Is there sufficient audit logging?

**For Processes:**
- All six STRIDE categories apply. Focus on:
- **Tampering** — Input validation and data integrity.
- **Repudiation** — Logging and audit trail requirements.
- **Information Disclosure** — Data exposure through error messages, side channels, or insecure storage.
- **Elevation of Privilege** — Authorisation controls and privilege boundaries.

**For Data Stores:**
- **Tampering** — Data integrity controls, access restrictions.
- **Repudiation** — Audit logging for data access and modification.
- **Information Disclosure** — Encryption at rest, access control, data classification enforcement.
- **Denial of Service** — Availability controls, backup strategy, rate limiting.

**For Trust Boundaries:**
- **Spoofing** — Authentication and identity verification at boundary crossings.
- **Elevation of Privilege** — Authorisation enforcement, ensuring lower-trust entities cannot access higher-trust resources.

---

## AI-Powered DFD Analysis

DFD elements and categorisations are fully integrated with the AI analysis pipeline:

- The AI receives both the specific node type and its DFD category in the analysis context.
- DFD Type descriptions (e.g., "Payment Processing Gateway") are included in the prompt, giving the AI domain-specific context.
- The AI applies STRIDE methodology based on DFD categories alongside its general threat analysis.

**Example queries you can ask the AI:**
- "What are the STRIDE threats to the API gateway?"
- "Which data stores in the DMZ zone contain sensitive data?"
- "What authentication controls are needed at the trust boundary between the external and internal zones?"
- "Analyse the data flows crossing the corporate network boundary for encryption gaps."

---

## The Rule Engine

ContextCypher includes a deterministic rule engine that runs without any AI provider. It analyses your diagram automatically (with a short debounce) whenever you add, remove, or update a node or edge, change zone boundaries, or edit metadata.

### How Findings Are Surfaced

Rule engine findings appear directly on each node and edge — there is no separate findings report or overlay on the diagram canvas.

**In the Node Editor:**

Double-click any node to open the Node Editor. It has three tabs:

1. **Properties** — The node's standard configuration fields (label, description, metadata, DFD settings, etc.).
2. **Security Findings** (floating mode) / **Rule Based Threats** (dialog mode) — All rule engine findings for this node, its connected edges, and (for zone nodes) the zone itself.
3. **Identified Threats (AI)** — AI-generated threat analysis (requires an AI provider).

Each finding in the Security Findings tab shows:
- A **warning icon** and the **finding title**.
- **Category chip** (e.g., DFD, BOUNDARY, DATA, IDENTITY, ENCRYPTION, AVAILABILITY, LOGGING, CONFIG, THREAT).
- **Rule ID** in monospace (e.g., `TB-001`, `DP-002`, `S03`).
- **STRIDE category chips** — colour-coded to show which STRIDE threats this finding relates to.
- **Connection context** — For edge-related findings, the source → target connection is shown so you know which data flow triggered the rule.
- **Description** of the issue.
- **Numbered recommendations** for remediation.

The Security Findings tab label appears at full opacity when findings exist and reduced opacity when there are none, giving you a quick visual cue.

**In the Quick Inspector:**

When you hover over or single-click a node or edge, the Quick Inspector popup shows the first three finding titles under a "Rule Based Findings (Non-AI)" heading. This gives you a quick preview without opening the full Node Editor.

### Syncing Findings to the GRC Module

Rule engine findings from the diagram can be imported into the **Findings tab** in the GRC module. This is a one-way, user-triggered sync — findings are never pushed automatically.

**To sync findings:**

1. Switch to the **GRC module**.
2. Open the **Findings** tab.
3. Click the **"Sync from Rule Engine"** button in the header. The button shows the number of available rule engine findings (e.g., "Sync from Rule Engine (42)").
4. The sync imports new findings and reports how many were added vs. how many already existed.

**What happens during sync:**

- Each rule engine finding is converted to a `GrcFinding` with appropriate type, severity, source ("Rule Engine"), STRIDE categories, and related node/edge IDs.
- Deduplication is by rule ID + related node IDs, so re-syncing does not create duplicates.
- The finding's category is mapped to severity (e.g., boundary/encryption findings become High, DFD integrity findings become Medium).

**Once findings are in GRC, you can:**

- **Change status** — Open, In Review, Accepted, Mitigated, Dismissed.
- **Create a Risk** — One click creates a linked GRC Risk with the finding's title, description, and an auto-mapped tier path.
- **Create a Task** — One click creates a remediation task linked to the finding (priority derived from severity).
- **Focus the diagram node** — Click the crosshair icon to switch back to the diagram and centre on the affected component.
- **Edit owner and notes** — Assign accountability and add context in the expanded detail row.
- **View linked entities** — See linked assets, risks, and tasks with click-through navigation to their respective GRC tabs.

You can also **add findings manually** in the GRC Findings tab without syncing from the rule engine. Manual findings have source "Manual" and can be linked to components, risks, and tasks just like synced findings.

**Filtering and sorting:**

The GRC Findings table supports filtering by type (Threat, Vulnerability, Weakness, Observation), severity (Critical, High, Medium, Low, Info), category, and STRIDE category. A text search bar lets you filter by title, description, or rule ID. All columns are sortable and the column layout is configurable.

---

## Rule Engine Reference

The following sections provide a comprehensive reference of all rule-based checks. These run deterministically — no AI required.

### DFD Integrity (Rules DFD-001 through DFD-006)
- **DFD-001**: External entity must not directly connect to a data store (needs a process in between).
- **DFD-002**: Data flow must have a label (data name).
- **DFD-003**: Process must have at least one input and one output.
- **DFD-004**: Data store must be connected to at least one process.
- **DFD-005**: Unconnected node (or isolated subgraph) flagged.
- **DFD-006**: DFD actor/process/store missing type annotation.

### Trust Boundary (Rules TB-001 through TB-004)
- **TB-001**: Flow crossing zones must specify protocol and encryption.
- **TB-002**: Flow from lower trust to higher trust requires authentication.
- **TB-003**: Trust boundary missing type definition.
- **TB-004**: Zone without classification when containing sensitive data.

### Data Protection (Rules DP-001 through DP-003)
- **DP-001**: Sensitive data in transit without encryption.
- **DP-002**: Sensitive data at rest in a store without encryption control.
- **DP-003**: PII/PHI/PCI flows must include logging or monitoring control.

### Identity and Access (Rules IA-001 through IA-003)
- **IA-001**: Any external ingress to internal zone must specify an authentication mechanism.
- **IA-002**: Admin or management interfaces should not be reachable from external zones.
- **IA-003**: Missing MFA control for privileged components.

### Availability and Resilience (Rules AR-001, AR-002, AR-EDGE-001)
- **AR-001**: Single points of failure (node with many inbound/outbound connections).
- **AR-EDGE-001**: Sensitive or critical flow missing redundancy.
- **AR-002**: Critical zone with no redundancy noted in controls.

### Observability (Rules OB-001, OB-002)
- **OB-001**: Edge with sensitive data but no logging control.
- **OB-002**: Security controls node missing connections to monitored components.

### OWASP Top 10 2021 (Rules A01 through A10)

Dedicated checks mapped to each OWASP category:
- **A01**: Broken Access Control — authorisation/missing auth checks on cross-zone flows.
- **A02**: Cryptographic Failures — missing encryption in transit/at rest.
- **A03**: Injection — external-facing components without validation controls.
- **A04**: Insecure Design — DFD integrity gaps and missing classifications.
- **A05**: Security Misconfiguration — exposed components lacking security controls.
- **A06**: Vulnerable and Outdated Components — missing version/patch metadata.
- **A07**: Identification and Authentication Failures — missing or weak auth/MFA on privileged flows.
- **A08**: Software and Data Integrity Failures — missing artifact integrity controls.
- **A09**: Security Logging and Monitoring Failures — missing logging/monitoring on sensitive flows.
- **A10**: Server-Side Request Forgery — missing egress controls on outbound HTTP/S.

### STRIDE Coverage (Rules S01 through S06)
- **S01**: Spoofing — Missing authentication/MFA on low-to-high trust flows or external ingress.
- **S02**: Tampering — Sensitive data or artifacts without integrity/encryption controls.
- **S03**: Repudiation — Sensitive flows/components missing logging or audit controls.
- **S04**: Information Disclosure — Sensitive data without classification or encryption at rest/in transit.
- **S05**: Denial of Service — Single points of failure, missing redundancy, or missing traffic protections.
- **S06**: Elevation of Privilege — Privileged components/flows missing authorisation controls.

### Node-Type Contextual Hints (CTX-* Rules)

Every non-structural node receives one contextual STRIDE finding based on its component type. These are advisory — they surface which STRIDE categories deserve focused attention for that component type.

| Rule ID | Node Types | STRIDE Focus |
|---|---|---|
| CTX-STORAGE | storage, cloudStorage | Information Disclosure, Tampering, Repudiation |
| CTX-DB | database, dataWarehouse | Tampering, Information Disclosure, EoP, Repudiation |
| CTX-WEB | webServer | Tampering, Information Disclosure, EoP, DoS |
| CTX-APIGW | apiGateway | Spoofing, EoP, DoS |
| CTX-MSG | messageQueue | Spoofing, Tampering, Repudiation, DoS |
| CTX-FW | firewall | EoP, Tampering, Repudiation |
| CTX-LB | loadBalancer | DoS, Spoofing, EoP |
| CTX-IAM | identityProvider | Spoofing, EoP, Repudiation |
| CTX-CICD | cicdPipeline | Tampering, EoP, Repudiation |
| CTX-COMPUTE | virtualMachine, container, server | EoP, Tampering, Information Disclosure |
| CTX-OT | plc, rtu, scada | Tampering, DoS, Spoofing |
| CTX-AI | aiModel, llmService | Spoofing, Information Disclosure, Tampering |
| CTX-ENDPOINT | workstation, laptop, smartphone, tablet | Spoofing, Tampering, Information Disclosure |

The full list covers 25+ node types including storage, web servers, firewalls, load balancers, routers, monitors, key management, identity providers, VPNs, IDS, bastion hosts, CI/CD pipelines, OT components (PLCs, RTUs, SCADA), AI models, vector databases, and endpoints.

### Finding Severity Heuristics

The rule engine assigns severity based on risk context:
- **Critical**: Policy breach with sensitive data exposure (e.g., PII on an unencrypted external flow).
- **High**: Cross-zone flow missing authentication or encryption.
- **Medium**: Incomplete metadata or missing labels for sensitive flows.
- **Low**: Best-practice gaps or mild DFD violations.
- **Info**: Hygiene and completeness suggestions.

---

## Example Scenarios

### Traditional DFD Approach

Using pure DFD nodes:

```
[Mobile Application Users] --HTTPS--> [E-Commerce API Gateway] --TLS--> [Customer Profile Database]
        ^                                    |
        |                                    |
     External                         [DMZ to Internal Network Boundary]
```

- Pure DFD nodes with custom types (e.g., Actor Type: "Mobile Application Users").
- Focus on data flows and trust boundaries.
- High-level view for initial threat modeling.

### Hybrid Approach

Starting with detailed component nodes:

1. nginx (type: server) → Auto-categorised as "Process"
2. PostgreSQL (type: database) → Auto-categorised as "Data Store"
3. Mobile App (type: smartphone) → Auto-categorised as "Actor"

Then enhance with DFD Types in the Node Editor:
- nginx → DFD Type: "Web Application Gateway"
- PostgreSQL → DFD Type: "Customer Data Repository"
- Mobile App → DFD Type: "End User Application"

The STRIDE threat chips in the Node Editor update to reflect the applicable threats for each DFD category.

### Migration Scenario

**Phase 1 — Pure DFD:**
```
[External User] --> [Web Process] --> [Database]
```

**Phase 2 — Hybrid (detailed nodes with DFD categories):**
```
[smartphone: "Mobile User"] --> [nginx: "API Gateway"] --> [postgresql: "User DB"]
```

**Phase 3 — Full detail (with vendor/version metadata):**
```
[iPhone 15 Pro] --> [nginx 1.24.0] --> [PostgreSQL 15.3]
```

DFD categories are retained throughout all phases, so STRIDE analysis works at every level of detail.

---

## End-to-End Workflow: From Diagram to GRC

1. **Build your diagram** using DFD nodes, detailed component nodes, or a mix of both.
2. **Review per-node findings** — Double-click any node and check the Security Findings tab. Each finding shows the rule ID, STRIDE categories, connection context, and recommendations.
3. **Check the Quick Inspector** — Hover over nodes and edges to see a quick summary of triggered rules.
4. **Switch to GRC** and open the **Findings** tab.
5. **Click "Sync from Rule Engine"** to import all diagram findings.
6. **Triage findings** — Change status, assign owners, add notes.
7. **Create Risks** from critical findings — one click per finding, with auto-linked tier path.
8. **Create Tasks** for remediation work — priority is derived from finding severity.
9. **Iterate** — As you update the diagram (add security controls, fill in metadata, fix DFD integrity issues), findings resolve. Re-sync to update the GRC Findings tab.

---

## Best Practices

### Getting Started
1. **Start high-level** — Begin with DFD elements for initial threat modeling to focus on data flows and trust boundaries.
2. **Define boundaries early** — Trust boundaries are critical for meaningful security analysis. The rule engine checks all cross-boundary flows.
3. **Refine gradually** — Replace generic DFD elements with specific component types as your design matures. DFD categories carry over automatically.
4. **Mix both** — Use DFD nodes for components you haven't designed yet, and detailed nodes for components you have.

### Hybrid Best Practices
- Review auto-assigned DFD categories and override if the default doesn't match your context.
- Add specific DFD Type descriptions for better AI analysis context.
- Use the STRIDE threat chips in the Node Editor to verify the right threat categories are being considered.

### Working with Rule Engine Findings
- Check the Security Findings tab on key nodes regularly as you build your diagram.
- Address high-severity findings first — they indicate missing encryption, authentication, or data protection on cross-zone flows.
- Use the GRC sync to build a persistent findings registry that tracks remediation status across sessions.
- Create Risks from findings to connect them to the broader GRC risk management workflow.

---

## Troubleshooting

### DFD Nodes Not Appearing
- Ensure you've expanded the **Threat Modeling (DFD)** category in the Node Toolbox.
- Check that the Node Toolbox panel is visible in the left sidebar.

### Analysis Not Covering DFD Nodes
- DFD nodes must have labels to be included in analysis.
- Trust boundaries need their Boundary Type property set for boundary-specific rules to trigger.
- The rule engine runs on a debounce — wait a moment after making changes for findings to update.

### DFD Category Not Showing in Node Editor
- The DFD Element Type section only appears for non-DFD, non-zone nodes. Pure DFD nodes (dfdActor, dfdProcess, etc.) show their own type-specific fields instead.
- Security Zone nodes don't show DFD category since they are already treated as trust boundaries.

### No Findings Appearing
- The rule engine needs nodes with connections to generate most findings. Isolated nodes will only trigger DFD-005 (unconnected node) and CTX-* contextual hints.
- Ensure edges have metadata (protocol, encryption, data classification) filled in — many rules check for missing metadata on connections.

### GRC Sync Shows "No rule engine findings"
- You need to have a diagram open with nodes and edges for the rule engine to produce findings.
- Switch back to the diagram module, verify nodes are present, then return to GRC and try syncing again.
