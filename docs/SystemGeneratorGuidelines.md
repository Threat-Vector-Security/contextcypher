# Advanced Protocols for Generating Security System Diagrams

## CRITICAL: ExampleSystem Structure

When creating example systems, use this exact structure:

```typescript
import { ExampleSystem } from '../../types/ExampleSystemTypes';
import { SecurityNode, SecurityEdge, SecurityZone } from '../../types/SecurityTypes';
import { DiagramAttackPath } from '../../types/GrcTypes';
import { colors } from '../../styles/Theme';

export const systemName: ExampleSystem = {
  id: 'kebab-case-placeholder', // This is just a placeholder - DiagramIndexer.js generates actual codes
  name: 'System Display Name',
  description: 'Brief description',
  category: 'Category Name', // Must match a category in exampleSystems.ts
  primaryZone: 'Internal', // Primary security zone
  dataClassification: 'Internal', // 'Public' | 'Internal' | 'Sensitive' | 'Confidential'
  customContext: `Detailed markdown content...`,
  grcWorkspace: importedGrcWorkspace, // Optional: GRC module data (see Section 11)
  attackPaths: attackPathsArray,       // Optional: diagram-level attack paths (see Section 12)
  nodes: [
    // Security zones as special nodes
    {
      id: 'zone-id',
      type: 'securityZone',
      position: { x: 50, y: 50 },
      data: {
        label: 'Zone Label',
        zoneType: 'DMZ' as SecurityZone,
        description: 'Zone description'
      },
      style: {
        width: 650,
        height: 1000,
        background: colors.zoneBackgrounds.DMZ,
        zIndex: -1
      }
    } as SecurityNode,
    // Regular nodes...
  ],
  edges: [
    {
      id: 'e1',
      source: 'source-node-id',
      target: 'target-node-id',
      type: 'securityEdge',
      sourceHandle: 'right',
      targetHandle: 'left',
      data: {
        label: 'Connection Label',
        protocol: 'HTTPS',
        encryption: 'TLS 1.3',
        dataClassification: 'Internal',
        zone: 'TargetZone' as SecurityZone, // REQUIRED: zone assignment
        animated: true
      }
    } as SecurityEdge
  ]
};
```

## 1. Zone Layout Protocol & Architecture Patterns

### Multi-Dimensional Layout
Zones can be arranged in horizontal, vertical, and hybrid layouts to optimize edge flow and demonstrate realistic security architectures. **Zones do not need to be uniform widths** — vary the width to reflect the density of services in each zone, and avoid a monotonous uniform-column look.

### Architecture Pattern Templates
- **Traditional Enterprise**: Internet → DMZ → Internal → Restricted → Critical
- **DevOps Pipeline**: Development → Staging → Production → Trusted (with Cloud above)
- **Industrial/OT**: External → DMZ → OT → Critical (air-gapped) + Compliance
- **Zero Trust**: Multiple micro-zones with security checkpoints between each
- **Hybrid Cloud**: On-premises zones + multiple Cloud zones (AWS, Azure, GCP)
- **Service Mesh**: Container zones with sidecar security proxies
- **Hub-and-Spoke**: Central security services with application spokes
- **Layered Defense**: Multiple security zones in depth with overlapping controls

### Zone Relationship Rules
- **Internet/External** → Always connects through DMZ (never direct to Internal)
- **Development** → Should connect to Staging → Production (CI/CD flow)
- **OT/Critical** → Should have air-gapped options or heavily controlled connections
- **Compliance** → Isolated zones for regulated data (PCI, HIPAA, SOX)
- **Cloud** → Can be positioned above/below for hybrid architectures
- **Guest** → Typically below main flow for visitor/contractor access

### Available Security Zones
Internet, External, DMZ, Internal, Trusted, Restricted, Critical, OT, Development, Staging, Production, Cloud, Guest, Compliance

### Zone Dimensions — Variable Widths
Zones do not have to be a fixed 650px. Use widths that reflect the number of nodes hosted:

| Zone density | Recommended width |
|-------------|-------------------|
| 1–3 nodes   | 600–650px         |
| 4–6 nodes   | 700–900px         |
| 7+ nodes    | 900–1100px        |

Height is typically 1000–1100px for the primary row. Secondary rows (Cloud above, Pipeline below) use similar heights. Always leave ≥120px between adjacent zone edges (zone_x + zone_width + 120 ≤ next_zone_x).

### 3-Row Layout Template (Recommended for Complex Systems)

```
Row 1 — Cloud tier (above primary):  y = -1150, height = 1000
Row 0 — Primary security row:        y =    50, height = 1050
Row 2 — Pipeline / management row:   y =  1220, height = 800
```

**E-Commerce reference layout** (5 primary zones + 3 pipeline zones + 1 cloud zone):

```
Primary row (y=50):
  Internet   x=50,   w=650
  DMZ        x=820,  w=900   ← wider; holds web-tier horizontally
  Internal   x=1840, w=800
  Restricted x=2760, w=700

Cloud row (y=-1150, above Internal+Restricted):
  Cloud      x=1840, w=1300  ← spans same x-range as Internal+Restricted

Pipeline row (y=1220, below primary):
  Development  x=50
  Management   x=820
  Staging      x=1840
```

### Layout Templates & Positioning
- **5-Zone Horizontal**: x: 50, 820, 1590, 2360, 3130 (enterprise progression)
- **Vertical Stack**: y: 50 (primary), -1070 (above), 1170 (below), 2290 (far below)
- **L-Shape**: Horizontal primary + vertical secondary (DevOps, Cloud hybrid)
- **Hub-Spoke**: Central zone at (1590, 50) with spokes at cardinal positions
- **Multi-tier**: 3 rows — Cloud(-1150), Primary(50), Pipeline(1220)
- **Air-gapped**: Isolated zones with no connections (Critical systems)

### Zone Flow Patterns
- **Security Progression**: Lower trust → Higher trust (left to right)
- **Development Lifecycle**: Dev → Test → Prod (with approval gates)
- **Data Classification**: Public → Internal → Confidential → Restricted
- **Network Segmentation**: Perimeter → Application → Data → Management

## 2. Enhanced Node Placement Protocol with Grid System

### Grid System
All nodes should align to a 50px grid for consistent spacing and professional appearance:
- Grid unit: 50px (all positions should be multiples of 50)
- Node dimensions: 150px width × 100px height (3×2 grid units)
- Grid columns per zone: divide zone width by 50

### Critical Rule
All nodes MUST be positioned within their designated security zone boundaries.

### Grid-aligned Spacing
- Minimum horizontal spacing: 200px (4 grid units)
- Minimum vertical spacing: 150px (3 grid units)
- Nodes with multiple connections: 250px (5 grid units) minimum

### Security Controls Positioning
Firewalls and security devices should be positioned:
- On zone boundaries (at the edge between zones) when they control cross-zone traffic
- Within the zone they protect when they are zone-specific controls

### Network Infrastructure Abstraction Level

Threat modeling diagrams operate at the "what trusts what" level, not the physical network topology level. Apply these rules when deciding whether to include network infrastructure nodes:

**Include routers** — The edge/border router is a trust boundary where ACLs, BGP filtering, and ingress/egress policies live. It is a meaningful security control point. Internal routers between major zones can also be included when they enforce routing policy.

**Omit switches** — Switches are Layer 2 fabric and are transparent to the threat model in most scenarios. They don't enforce security zones (the firewall does) and adding them creates noise without adding security context.

**Exception — include switches when:**
- **OT/ICS diagrams**: Managed switches with specific port configs are often the only segmentation mechanism; VLAN hopping and trunk port exposure are real threats.
- **VLAN-based micro-segmentation**: Where a switch IS the security boundary and no dedicated firewall sits between segments.
- **Specific attack scenarios**: Spanning tree manipulation, CAM table flooding, untagged VLAN exposure.
- **Network Infrastructure category examples**: Where the Layer 2/3 topology itself is the subject of the threat model.

For standard web application, cloud, and enterprise examples, the `router` node type at zone boundaries is the correct level of abstraction.

### Grid-aligned Component Tiers
Group by function on grid rows:
- Infrastructure components (routers, firewalls): y: 150-300px (rows 3-6)
- Application components (web servers, app servers): y: 350-600px (rows 7-12)
- Data components (databases, storage): y: 650-850px (rows 13-17)
- Monitoring/Support components: y: 900px+ (rows 18+)

### Flow Lanes & Edge-Reduction Heuristics
Use lanes to reduce crossings and keep high-traffic edges straight:
- **Ingress lane (left-to-right):** Router → Perimeter Firewall → WAF → Web → Load Balancer (same row in DMZ).
- **Core processing lane:** Place internal firewalls on the left boundary of their zone; app servers to the right on the same row.
- **Data lane:** Database firewall left, primary/replica databases to the right on the same row.
- **Monitoring spine:** Centralize SIEM/log storage in one vertical column; align IDS sensors above it for mostly vertical edges.
- **Cloud verticals:** Place cloud services directly above the internal components they serve to encourage vertical edges.
- **High fan-in/out nodes:** Center them on their zone's primary row and keep 200–250px spacing from neighbors.

### Crossing Minimization Rules
- Align source/target nodes horizontally for same-tier flows and vertically for cross-zone flows.
- Avoid diagonal edges that pass through unrelated nodes by shifting the target up/down one grid row.
- When multiple edges share a source/target, stagger the connected nodes by 50–100px to prevent overlap.
- Prefer routing log/monitoring edges down to a single spine rather than connecting across the entire zone.
- **Position the Internet-zone router/gateway at the RIGHT side of the Internet zone** so that the distance from Internet zone to DMZ is short, reducing the length of bypass arcs.

### Grid Positioning Examples
- Left-aligned in zone: x: zone_x + 100 (2 grid units from edge)
- Center-aligned in zone: x: zone_x + 250 (centered with 5 units each side)
- Right-aligned in zone: x: zone_x + 400 (8 units from left, 2 from right)

## 3. Connection Protocol

### CRITICAL: Edge Zone Assignment Rules
Every edge MUST include a `zone` property in its data object. The zone assignment determines the security context of the connection.

#### Zone Assignment Rules:
1. **Same-Zone Connections**: Use the zone both nodes are in
   - Example: Two nodes in Production → `zone: 'Production'`

2. **Cross-Zone Connections**: Use the more secure/restricted zone
   - Internet → DMZ: `zone: 'DMZ'`
   - DMZ → Production: `zone: 'Production'`
   - Internal → Restricted: `zone: 'Restricted'`

3. **Cloud Connections**:
   - To Cloud: `zone: 'Cloud'`
   - From Cloud: Use the target zone

4. **Security Control Connections**:
   - Firewall/WAF filtering: Use the protected zone
   - Monitoring/logging: Use the monitored zone

5. **Vulnerability/Bypass Connections**: Use the target zone
   - Direct access bypassing controls uses the target zone

#### Example Edge with Zone:
```typescript
{
  id: 'e1',
  source: 'external-users',
  target: 'api-gateway',
  type: 'securityEdge',
  data: {
    label: 'API Requests',
    protocol: 'HTTPS',
    encryption: 'TLS 1.3',
    securityLevel: 'High',
    dataClassification: 'Internal',
    zone: 'DMZ' as SecurityZone, // REQUIRED
    animated: true
  }
} as SecurityEdge
```

### Multi-Directional Flow
Connections can flow horizontally, vertically, and diagonally based on zone layout.

### Primary Flow Patterns
- **Horizontal**: Core security progression (Internet → DMZ → Internal)
- **Vertical**: Cloud services (Internal ↔ Cloud above) or Guest services (DMZ ↔ Guest below)
- **Diagonal**: Cross-quadrant connections (Guest to Cloud, OT to Cloud)

All connections must be clearly labeled with their purpose or protocol.

### Control Point Routing — Four Categories

Use control points on edges to prevent crossings, route bypass paths, and organise monitoring flows. Every `controlPoint` entry must have `{ id: string, x: number, y: number, active: true }`.

#### Category 1 — Internet Bypass Arcs (above all zones)
For edges that represent bypass paths from the Internet zone directly to an internal node, route them **above all zones** using `sourceHandle: 'top'` and `targetHandle: 'top'` with control points at `y ≈ -100` (well above the top of any zone at `y = 50`).

```typescript
{
  id: 'app1-debug-port',
  source: 'edge-router',
  target: 'app-server-1',
  type: 'securityEdge',
  sourceHandle: 'top',
  targetHandle: 'top',
  data: {
    label: 'Debug Port (8000)',
    protocol: 'HTTP',
    encryption: 'none',
    dataClassification: 'Internal',
    zone: 'Internal' as SecurityZone,
    controlPoints: [
      { id: 'cp-dbg-1', x: 620, y: -100, active: true },
      { id: 'cp-dbg-2', x: 2050, y: -100, active: true }
    ]
  }
} as SecurityEdge
```

#### Category 2 — Internal Bypass Arcs (route below a blocking node)
For edges that bypass an intermediate firewall or control within a zone, route them below the blocking node using `sourceHandle: 'bottom'` / `targetHandle: 'bottom'` and control points at a y value between the blocking node's row and the bottom of the zone (typically `y ≈ 600–800`).

```typescript
{
  id: 'internal-fw-bypass',
  source: 'app-server-1',
  target: 'db-replica',
  type: 'securityEdge',
  sourceHandle: 'bottom',
  targetHandle: 'bottom',
  data: {
    label: 'Direct DB Access (bypass)',
    protocol: 'MySQL',
    encryption: 'none',
    dataClassification: 'Restricted',
    zone: 'Restricted' as SecurityZone,
    controlPoints: [
      { id: 'cp-bypass-1', x: 2100, y: 750, active: true },
      { id: 'cp-bypass-2', x: 2900, y: 750, active: true }
    ]
  }
} as SecurityEdge
```

#### Category 3 — Monitoring Bottom Channel (all log/SIEM edges flow out the bottom)
Group all monitoring, logging, and telemetry edges along a shared horizontal channel **below** the primary node rows, at `y ≈ 1010` (near the bottom of zones whose height is 1050). Use `sourceHandle: 'bottom'` and `targetHandle: 'bottom'` so all monitoring wires stay below the working area and don't clutter the main flow.

```typescript
{
  id: 'app1-to-siem',
  source: 'app-server-1',
  target: 'siem',
  type: 'securityEdge',
  sourceHandle: 'bottom',
  targetHandle: 'bottom',
  data: {
    label: 'Application Logs',
    protocol: 'Syslog',
    encryption: 'TLS 1.3',
    dataClassification: 'Internal',
    zone: 'Internal' as SecurityZone,
    controlPoints: [
      { id: 'cp-mon-1', x: 2050, y: 1010, active: true },
      { id: 'cp-mon-2', x: 2300, y: 1010, active: true }
    ]
  }
} as SecurityEdge
```

#### Category 4 — Inter-Zone Gap Routing (between primary and pipeline rows)
For edges that connect a primary-row zone to a pipeline-row zone (e.g., Internal → Staging at y=1220), route them through the gap between the two rows at `y ≈ 1150`. Use `sourceHandle: 'bottom'` and `targetHandle: 'top'`.

```typescript
{
  id: 'dev-to-staging',
  source: 'ci-cd-server',
  target: 'staging-server',
  type: 'securityEdge',
  sourceHandle: 'bottom',
  targetHandle: 'top',
  data: {
    label: 'Deployment Pipeline',
    protocol: 'SSH',
    encryption: 'TLS 1.3',
    dataClassification: 'Internal',
    zone: 'Staging' as SecurityZone,
    controlPoints: [
      { id: 'cp-gap-1', x: 300, y: 1150, active: true },
      { id: 'cp-gap-2', x: 2050, y: 1150, active: true }
    ]
  }
} as SecurityEdge
```

### Vertical Alignment Trick
When two nodes at the same x-coordinate are in adjacent zones (e.g., a firewall at the left edge of DMZ and a VPN gateway at the left edge of Internal both at `x = 900`), use `sourceHandle: 'right'` / `targetHandle: 'left'` with **no control points** — ReactFlow draws a clean vertical bezier automatically.

### Edge Crossing Minimization
- Position related zones closer together (e.g., Cloud above Internal/Production)
- Use vertical connections for zones positioned above/below each other
- Avoid routing connections through unrelated zones
- Use control point categories above to route around dense node clusters

### Parallel Edge Prevention
When multiple edges go in the same direction:
- Use vertical offset between source nodes (minimum 50px)
- Alternate handle positions (top/bottom for vertical, left/right for horizontal)
- Consider using intermediate routing nodes for complex flows

## 4. Enhanced Vulnerability Integration Philosophy

### Primary Goal
Create realistic example systems with inherent, subtle vulnerabilities that the AI can discover through analysis. The system should not explicitly state what is a vulnerability.

### Vulnerability Categories
- **Configuration Weaknesses**: Default passwords, open ports, weak encryption
- **Architectural Flaws**: Missing segmentation, direct database access, bypass paths
- **Missing Controls**: No monitoring, weak authentication, unencrypted communications
- **Operational Gaps**: Shared accounts, excessive privileges, poor change management
- **Compliance Violations**: Regulatory requirement gaps, audit trail deficiencies
- **Zero Trust Violations**: Implicit trust relationships, lateral movement paths

### Realism Principles
- **Common Mistakes**: Reflect actual security incidents and penetration test findings
- **Legacy Integration**: Show challenges of integrating old and new systems
- **Operational Pressure**: Demonstrate security vs. usability trade-offs
- **Resource Constraints**: Show impact of limited security budgets and staffing

### Discovery Mechanisms
The AI should identify vulnerabilities through:
- **Component Analysis**: Version checks, configuration review, protocol analysis
- **Connection Patterns**: Unusual flows, missing security controls, trust boundaries
- **Zone Violations**: Inappropriate cross-zone access, missing segmentation
- **Control Gaps**: Missing monitoring, logging, encryption, authentication

### Educational Value
Systems should demonstrate both exemplary security practices and realistic improvement opportunities.

### Subtlety
The aim is to have a mix of subtle and more apparent issues that a security professional would identify during a threat modeling exercise. Avoid making all issues obvious.

### Developer-Facing Comments
Code comments within the example system TypeScript files that detail vulnerabilities are acceptable for developer reference, as they are not visible to the AI during analysis.

## 5. Custom Context Protocol

### Perspective
The `customContext` field provides a narrative for the system, written from the perspective of an architect or system owner.

### Content
It should include system overview, technical architecture, business requirements, and operational considerations.

### Implicit Clues
It must NOT explicitly list security issues or use the word "vulnerability". Instead, describe configurations factually. These descriptions can serve as clues. For example:
- "Default error pages enabled showing system information"
- "Shared admin account used for emergency access"
- "Remote debugging enabled on port 8000"

### Formatting
Format as markdown for readability.

## 6. Handle Connection Protocol

### Handle System
Each node and security zone has 4 handles for precise connections.

### Handle Selection
- **Intelligent Handle Selection**: The system automatically selects the best handles based on node positions
- **Position-Based Logic**: For same-zone connections, handles are chosen based on relative positions (closest sides)
- **Zone-Aware Logic**: For cross-zone connections, considers both zone flow and physical positioning

### Handle IDs
Follow the pattern: "{position}-{type}" (e.g., "right-source", "left-target").

### Manual Override
Explicitly specify sourceHandle and targetHandle in connections to override automatic selection.

### Connection Rules
- Only source → target connections are valid
- Same-node connections are not allowed
- Connections automatically choose the shortest visual path between nodes

### Handle Selection by Routing Category

| Routing category | sourceHandle | targetHandle |
|-----------------|-------------|-------------|
| Normal left→right cross-zone | `'right'` | `'left'` |
| Internet bypass arc (above all zones) | `'top'` | `'top'` |
| Internal bypass arc (below blocker) | `'bottom'` | `'bottom'` |
| Monitoring bottom channel | `'bottom'` | `'bottom'` |
| Inter-zone gap (primary→pipeline) | `'bottom'` | `'top'` |
| Cloud vertical (primary→cloud above) | `'top'` | `'bottom'` |
| Vertically aligned adjacent zones | `'right'` | `'left'` (no control points needed) |

## 7. Advanced Layout Optimization & Common Mistakes

### Quality Checklist
- **Zone Boundary Compliance**: Ensure all components are within their designated zone boundaries
- **Variable Zone Widths**: Vary zone widths (600–1100px) to match node density; avoid monotonous uniform columns
- **Edge Crossing Minimization**: Use strategic node placement, zone arrangement, and control points to eliminate crossings
- **Density Management**: Maintain adequate spacing (200px horizontal, 150px vertical minimum)
- **Grid Alignment**: All nodes must align to 50px grid system for professional appearance
- **Connection Flow Logic**: Connections should follow realistic network paths and security policies
- **Control Point Routing**: Use the four routing categories (bypass arcs, internal bypass, monitoring channel, inter-zone gap)
- **No Through-Node Edges**: No edge should visually pass through an unrelated node — reroute with control points or reposition nodes
- **Visual Hierarchy**: Use consistent spacing patterns and component grouping
- **Zone Utilization**: Optimize zone space usage without overcrowding
- **Security Control Placement**: Position firewalls and security devices at appropriate zone boundaries
- **Attack Paths**: If the diagram has exploitable chains, define `attackPaths` on the `ExampleSystem`

## 8. Architecture Pattern Examples

- **Enterprise Data Center**: External → DMZ → Internal → Restricted → Critical + Cloud above
- **DevOps Platform**: Development → Staging → Production → Trusted + Guest below
- **Industrial Control**: External → DMZ → OT → Critical (air-gapped) + Compliance
- **Zero Trust Network**: Multiple micro-zones with security checkpoints
- **Hybrid Cloud**: On-premises zones + AWS/Azure/GCP zones positioned strategically
- **Service Mesh**: Container zones with sidecar proxies and central control plane

## 9. Cloud Vendor Architecture Guidelines

### Purpose and Philosophy
Cloud vendor architectures demonstrate realistic multi-cloud deployments with vendor-specific services, identity controls, and security misconfigurations. These systems should showcase how cloud-native security controls drift over time, creating exploitable attack chains.

### Standard Zone Layout for Cloud Architectures
All cloud vendor examples use a **4-zone horizontal layout**:
- **Internet** (x: 50): External users, partners, automation
- **DMZ** (x: 820): Edge services, CDN, WAF, API gateways
- **Cloud** (x: 1590): Core workloads, compute, storage, databases
- **Management** (x: 2360): Identity, monitoring, logging, privileged access

### Required Service Categories by Vendor

#### AWS Services (Minimum 15-20 nodes)
**Edge/Ingress (DMZ)**:
- CloudFront, Route53, API Gateway, WAF

**Compute (Cloud)**:
- EC2, ECS/Fargate, Lambda, EKS

**Storage & Data (Cloud)**:
- S3, RDS/Aurora, DynamoDB, ElastiCache, Redshift

**Identity & Access (Management)**:
- IAM, Cognito, SSO, Secrets Manager, KMS, ACM, Directory Service

**Security Services (Management)**:
- GuardDuty, Security Hub, Config, CloudTrail, Macie, Inspector, Detective, WAF, Shield

**Networking (Cloud/DMZ)**:
- VPC, Transit Gateway, Direct Connect, PrivateLink

**Monitoring (Management)**:
- CloudWatch, CloudWatch Logs, X-Ray, EventBridge

#### Azure Services (Minimum 15-20 nodes)
**Edge/Ingress (DMZ)**:
- Front Door, Application Gateway, API Management

**Compute (Cloud)**:
- App Service, Azure Functions, AKS, Virtual Machines, Container Instances

**Storage & Data (Cloud)**:
- Blob Storage, Azure SQL, Cosmos DB, Data Lake Storage

**Identity & Access (Management)**:
- Azure AD/Entra ID, Azure AD B2C, Managed Identity, Key Vault

**Security Services (Management)**:
- Security Center/Defender for Cloud, Sentinel, Policy, Blueprints, Firewall, DDoS Protection, Bastion

**Networking (Cloud/DMZ)**:
- Virtual Network, VPN Gateway, ExpressRoute, Private Link

**Monitoring (Management)**:
- Monitor, Log Analytics, Application Insights

#### GCP Services (Minimum 15-20 nodes)
**Edge/Ingress (DMZ)**:
- Cloud Load Balancing, Cloud CDN, Cloud Armor, API Gateway

**Compute (Cloud)**:
- Compute Engine, Cloud Run, Cloud Functions, GKE

**Storage & Data (Cloud)**:
- Cloud Storage, BigQuery, Cloud SQL, Spanner, Firestore, Memorystore

**Identity & Access (Management)**:
- Cloud IAM, Identity Platform, Cloud Identity, Secret Manager, Cloud KMS

**Security Services (Management)**:
- Security Command Center, Cloud DLP, VPC Service Controls, Binary Authorization, Web Security Scanner

**Networking (Cloud/DMZ)**:
- VPC, Cloud Interconnect, Cloud VPN, Private Service Connect

**Monitoring (Management)**:
- Cloud Logging, Cloud Monitoring, Cloud Trace

#### IBM Cloud Services (Minimum 12-15 nodes)
**Edge/Ingress (DMZ)**:
- Cloud Internet Services, Security Gateway, Load Balancer

**Compute (Cloud)**:
- Virtual Server, Code Engine, Cloud Functions, Kubernetes Service, Red Hat OpenShift

**Storage & Data (Cloud)**:
- Object Storage, Databases for PostgreSQL, Cloudant, DB2

**Identity & Access (Management)**:
- Cloud IAM, App ID, Key Protect, Secrets Manager

**Security Services (Management)**:
- Security Advisor, Certificate Manager, Hyper Protect

**Networking (Cloud)**:
- VPC, Transit Gateway, Direct Link

**Monitoring (Management)**:
- Cloud Monitoring, Log Analysis, Activity Tracker

### Cloud-Specific Vulnerability Patterns

#### Identity & Access Vulnerabilities
- **Over-Privileged Roles**: Service accounts with Admin/Editor/Contributor roles instead of least-privilege
- **Weak MFA**: Conditional access disabled, legacy auth allowed, MFA bypass tokens
- **Credential Exposure**: Service account keys stored in code, shared via email, hardcoded in containers
- **Federation Gaps**: External IdP trusted without device context, SAML assertion validation disabled
- **Break-Glass Abuse**: Emergency accounts excluded from security policies, no audit logging

#### Network & Perimeter Vulnerabilities
- **WAF Gaps**: Rules in detection-only mode, custom rules disabled, outdated managed rulesets
- **Bypass Paths**: Legacy origins allow direct access, alternate entry points skip controls
- **Header Injection**: X-Forwarded-For trusted without validation, bypass headers accepted
- **API Exposure**: Anonymous triggers enabled, throttling disabled, API keys shared insecurely

#### Data & Storage Vulnerabilities
- **Public Access**: S3/Blob containers with public-read ACLs, allAuthenticatedUsers grants
- **Encryption Gaps**: TDE disabled on replicas, CMEK not used, keys rotated manually
- **Credential Storage**: Connection strings in Key Vault accessible via broad roles, master keys shared
- **Lifecycle Failures**: No data retention policies, temporary debugging access never removed

#### Monitoring & Logging Vulnerabilities
- **Ingestion Throttling**: Log quotas causing data loss, alerts suppressed during spikes
- **Missing Coverage**: Flow logs disabled, audit logs reduced retention, VPC logging gaps
- **Integration Failures**: SIEM feeds misconfigured, logging sinks point to deleted projects
- **Alert Fatigue**: Findings suppressed, detection rules rely on missing data, no ticketing integration

### Node Positioning Strategy

#### DMZ Zone (x: 820)
```
y: 200 - Edge service (CloudFront/Front Door/Cloud Armor)
y: 200 - WAF/Security Gateway (inline with edge)
y: 200-400 - API Gateway/Application Gateway
y: 420 - Identity Provider (Cognito/Azure AD B2C/Identity Platform)
```

#### Cloud Zone (x: 1590)
```
Tier 1 (Compute): y: 220
- Primary compute service (left)
- Secondary compute (middle)
- Cache/Queue service (right)

Tier 2 (Data): y: 470
- Primary database (left)
- Document/NoSQL store (middle)
- Object storage (right)
```

#### Management Zone (x: 2360)
```
Tier 1 (Identity/Monitoring): y: 220
- IAM/Admin identity (left)
- Monitoring/Logging service (right)

Tier 2 (Operations): y: 470
- Bastion/Jump host (left)
- Key Vault/Secrets (right)
```

### Edge Routing Best Practices

#### Control Point Usage
Control points should be used to:
1. Route edges around dense node clusters
2. Create visual separation for parallel flows
3. Demonstrate bypass paths (vulnerabilities)
4. Show cross-zone connections cleanly

See Section 3 for the four routing categories and code examples.

#### Handle Selection Rules
- **Horizontal same-zone**: Use right→left handles
- **Vertical same-zone**: Use bottom→top or top→bottom
- **Cross-zone forward**: Use right→left (following zone progression)
- **Cross-zone backward** (management to production): Use left→right with control points
- **Diagonal connections**: Add control points to create L-shaped or stepped paths

### Vulnerability Narrative Structure

Each cloud vendor example should include in `customContext`:

1. **Architectural Overview** (2-3 sentences)
   - Describe the business purpose and cloud deployment model

2. **Subtle Vulnerabilities** (5-10 bullet points)
   - Each bullet describes a configuration **factually** without using "vulnerability" or "risk"
   - Focus on drifted controls, legacy settings, convenience shortcuts
   - Examples:
     - "WAF policy left in preview mode after testing"
     - "Service account retains Editor role from initial deployment"
     - "MFA enforcement disabled for contractor group"
     - "Bucket policy grants public-read for temporary debugging"

3. **Discovery Guidance** (1-2 sentences)
   - Suggest what the AI should explore (IAM escalation, data exfiltration, monitoring gaps)

### Cloud Vendor Example Checklist

- [ ] **Minimum Service Count**: 15-20 nodes for AWS/Azure/GCP, 12-15 for IBM
- [ ] **Identity Services**: At least 3 identity/access services included
- [ ] **Security Services**: At least 4 security/monitoring services included
- [ ] **Edge Services**: CDN/WAF/API Gateway in DMZ zone
- [ ] **Data Services**: Database + Object Storage in Cloud zone
- [ ] **Monitoring**: Logging and SIEM in Management zone
- [ ] **4-Zone Layout**: Internet → DMZ → Cloud → Management
- [ ] **Vulnerability Categories**: Identity, Network, Data, Monitoring gaps all represented
- [ ] **Control Points**: Used for bypass paths and cross-zone routing
- [ ] **Edge Zone Assignment**: Every edge has correct zone property
- [ ] **Custom Context**: Factual vulnerability descriptions without explicit security warnings

## 10. Comprehensive Quality Checklist

- [ ] **Zone Layout**: Variable-width zones (600–1100px), ≥120px spacing, no overlaps
- [ ] **3-Row Layout**: Cloud(-1150) / Primary(50) / Pipeline(1220) used where appropriate
- [ ] **Grid Alignment**: All nodes align to 50px grid (positions divisible by 50)
- [ ] **Node Spacing**: 200px horizontal, 150px vertical minimum between nodes
- [ ] **Security Progression**: Zone flow follows logical trust boundaries
- [ ] **Component Tiers**: Infrastructure, application, data, management layers clearly defined
- [ ] **Connection Logic**: All connections follow realistic network and security policies
- [ ] **Edge Zone Assignment**: Every edge has a zone property following the assignment rules
- [ ] **Control Point Routing**: Bypass arcs above (y≈-100), internal bypasses below blockers, monitoring bottom channel (y≈1010), pipeline gap (y≈1150)
- [ ] **No Through-Node Edges**: No edge passes visually through an unrelated node
- [ ] **Edge Separation**: Multiple connections between nodes are visually distinct
- [ ] **High-density Nodes**: Nodes with 3+ connections have 250-300px spacing
- [ ] **Visual Clarity**: No congestion, all labels and edges readable
- [ ] **Security Controls**: Firewalls, IDS/IPS positioned at appropriate boundaries
- [ ] **Vulnerability Integration**: Realistic security gaps for AI discovery
- [ ] **Architecture Pattern**: Follows established pattern (Enterprise, DevOps, Industrial, Cloud Vendor, etc.)
- [ ] **Attack Paths**: Defined if diagram contains exploitable chains (see Section 12)

## 11. GRC Workspace Data (Optional)

Example systems can include pre-populated GRC (Governance, Risk, Compliance) workspace data. When present, loading the example populates the GRC module alongside the diagram.

### Structure

GRC workspace data should be defined in a separate file (e.g., `vulnerableWebAppGrc.ts`) and imported into the main example system file:

```typescript
import { vulnerableWebAppGrcWorkspace } from './vulnerableWebAppGrc';

export const vulnerableWebApp: ExampleSystem = {
  // ... diagram fields ...
  grcWorkspace: vulnerableWebAppGrcWorkspace,
};
```

### GRC Workspace Components

The `GrcWorkspace` type (defined in `src/types/GrcTypes.ts`) includes:

- **riskModel**: Likelihood/impact scales (typically 5x5), matrix, and appetite threshold
- **tierCatalogue**: Hierarchical risk taxonomy (Tier 1-4)
- **assets**: Asset register entries linked to diagram nodes via `diagramRefs`
- **risks**: Risk register with tier paths, asset linkages, and inherent scores
- **assessments**: Assessment records scoping risks and assets
- **controlSets**: Imported or built-in control frameworks (e.g., OWASP Top 10)
- **soaEntries**: Statement of Applicability entries mapping controls to implementation status
- **aiAssist**: AI integration toggle/settings metadata

### Asset-to-Diagram Linking

Assets should reference diagram nodes using `diagramRefs`:

```typescript
{
  id: 'asset-web-server',
  name: 'Apache Web Server',
  type: 'web_server',
  diagramRefs: [{ diagramId: 'system-id', nodeId: 'web-server', nodeLabel: 'Web Server', nodeType: 'webServer' }],
  // ...
}
```

### Risk Scoring

Use `calculateRiskScore()` from `GrcWorkspaceService` to compute inherent scores:

```typescript
import { buildRiskMatrix, calculateRiskScore } from '../../services/GrcWorkspaceService';

const matrix = buildRiskMatrix(likelihoodScale, impactScale, appetiteThreshold);
const riskModel = { likelihoodScale, impactScale, matrix, appetiteThresholdScore: 12 };
const score = calculateRiskScore(riskModel, 'likelihood-4', 'impact-5');
```

### Assessment Threat Models

Each `GrcAssessment` can include a `threatModel` field (`GrcAssessmentThreatModel`) that captures the scope of the assessment as nodes, edges, and attack paths scoped from the diagram:

```typescript
import {
  AssessmentThreatModelNodeSourceType,
  AssessmentThreatModelEdgeSourceType,
  AttackPathRiskLevel,
} from '../../types/GrcTypes';
import { StrideCategory } from '../../types/ThreatIntelTypes';

const assessment: GrcAssessment = {
  id: 'assessment-web-tier',
  name: 'Web Tier Security Assessment',
  // ... other fields ...
  threatModel: {
    nodes: [
      {
        id: 'tm-node-web',
        sourceType: 'diagram_node' as AssessmentThreatModelNodeSourceType,
        sourceId: 'web-server',
        label: 'Web Server',
        nodeType: 'webServer',
        zone: 'DMZ',
        threats: ['Injection', 'Broken Authentication'],
      },
    ],
    edges: [
      {
        id: 'tm-edge-1',
        sourceType: 'diagram_edge' as AssessmentThreatModelEdgeSourceType,
        sourceId: 'e-internet-to-web',
        label: 'User Traffic',
        fromNodeId: 'tm-node-internet',
        toNodeId: 'tm-node-web',
        protocol: 'HTTPS',
        encrypted: true,
        threats: [],
      },
    ],
    attackPaths: [
      {
        id: 'ap-waf-bypass',
        diagramAttackPathId: 'attack-path-waf-bypass', // links to DiagramAttackPath in ExampleSystem
        name: 'WAF Bypass → Application Exploitation',
        strideCategory: 'Tampering' as StrideCategory,
        riskLevel: 'High' as AttackPathRiskLevel,
        description: 'WAF in detection-only mode allows malicious payloads to reach the application.',
        steps: [
          { stepNumber: 1, description: 'Send crafted payload to WAF', edgeId: 'e-internet-to-waf', nodeId: 'waf' },
          { stepNumber: 2, description: 'WAF logs but does not block', edgeId: 'e-waf-to-web', nodeId: 'web-server' },
        ],
        mitreTechniques: ['T1190'],
      },
    ],
    attackPathDescription: 'This assessment identified two exploitable paths through the web tier.',
    updatedAt: '2024-06-01T00:00:00Z',
  },
};
```

**Important**: `sourceType`, `strideCategory`, and `riskLevel` must be cast to their union types in `.ts` data files because TypeScript infers string literals as `string` in plain object literals:
- `sourceType: 'diagram_node' as AssessmentThreatModelNodeSourceType`
- `strideCategory: 'Tampering' as StrideCategory`
- `riskLevel: 'High' as AttackPathRiskLevel`

### Reference Implementation

See `src/data/exampleSystems/vulnerableWebAppGrc.ts` for a complete example with 10 assets, 11 risks, OWASP Top 10 controls, full SoA mapping, and assessment threat models with attack paths.

## 12. Attack Paths (DiagramAttackPath)

Attack paths represent exploitable chains through the diagram. They are defined at the `ExampleSystem` level (not inside the GRC workspace) and are loaded directly into the diagram editor when the example is opened.

### When to Include Attack Paths

Include `attackPaths` on an `ExampleSystem` when:
- The diagram has visible bypass edges (e.g., internet-visible debug port)
- There is a clear multi-step exploitation chain through real edges
- The system is in the **Web Applications**, **Red Teaming**, or **Targeted Threat Scenarios** category

### DiagramAttackPath Structure

```typescript
import { DiagramAttackPath } from '../../types/GrcTypes';
import { StrideCategory } from '../../types/ThreatIntelTypes';
import { AttackPathRiskLevel } from '../../types/GrcTypes';

const attackPaths: DiagramAttackPath[] = [
  {
    id: 'attack-path-debug-port',
    name: 'Internet-Facing Debug Port → Database Compromise',
    strideCategory: 'Elevation of Privilege' as StrideCategory,
    riskLevel: 'Critical' as AttackPathRiskLevel,
    description:
      'An attacker exploits the exposed debug port (8000) reachable directly from the Internet, ' +
      'bypassing the DMZ and WAF entirely, gains remote code execution on the application server, ' +
      'then pivots to the primary database.',
    steps: [
      {
        id: 'step-1',
        stepNumber: 1,
        edgeId: 'app1-debug-port',      // ID of the bypass edge in the diagram
        sourceNodeId: 'edge-router',
        targetNodeId: 'app-server-1',
        description: 'Attacker accesses the debug endpoint directly from the Internet via the exposed port.',
        strideCategory: 'Elevation of Privilege' as StrideCategory,
      },
      {
        id: 'step-2',
        stepNumber: 2,
        edgeId: 'app1-to-primary-db',
        sourceNodeId: 'app-server-1',
        targetNodeId: 'primary-db',
        description: 'Using RCE from the debug session, attacker connects directly to the primary database.',
        strideCategory: 'Information Disclosure' as StrideCategory,
      },
    ],
    mitreTechniques: ['T1190', 'T1078', 'T1005'],
    createdAt: '2024-06-01T00:00:00Z',
    updatedAt: '2024-06-01T00:00:00Z',
  },
];
```

### Wiring Attack Paths into the Example System

```typescript
import { DiagramAttackPath } from '../../types/GrcTypes';
import { attackPaths } from './vulnerableWebAppAttackPaths'; // or inline in the file

export const vulnerableWebApp: ExampleSystem = {
  // ... diagram fields ...
  grcWorkspace: vulnerableWebAppGrcWorkspace,
  attackPaths,
};
```

The `DiagramEditor` loads these via:
```typescript
setAttackPaths(exampleSystem.attackPaths ?? []);
```

### Linking Diagram Attack Paths to GRC Assessments

Each `AssessmentAttackPath` inside a `GrcAssessmentThreatModel` should include a `diagramAttackPathId` field that matches the `id` of the corresponding `DiagramAttackPath`. This creates a two-way link: the GRC assessment captures the scope and evidence, while the diagram shows the exploitable path visually.

### TypeScript Union Type Casting

In `.ts` data files, always cast union-typed string fields. TypeScript infers plain string literals as `string`, which breaks union type checks:

```typescript
// Required imports
import { StrideCategory } from '../../types/ThreatIntelTypes';
import {
  AttackPathRiskLevel,
  AssessmentThreatModelNodeSourceType,
  AssessmentThreatModelEdgeSourceType,
} from '../../types/GrcTypes';

// Required casts in data objects
strideCategory: 'Elevation of Privilege' as StrideCategory,
riskLevel: 'Critical' as AttackPathRiskLevel,
sourceType: 'diagram_node' as AssessmentThreatModelNodeSourceType,
sourceType: 'diagram_edge' as AssessmentThreatModelEdgeSourceType,
```

### Attack Path Quality Checklist

- [ ] Each `step.edgeId` references a real edge `id` from the `edges` array
- [ ] Each `step.sourceNodeId` / `step.targetNodeId` references real node `ids`
- [ ] Step numbers are sequential starting from 1
- [ ] `riskLevel` reflects the actual severity of the chain (Critical/High/Medium/Low)
- [ ] `strideCategory` matches the primary threat category of the overall chain
- [ ] Each step has its own `strideCategory` for the individual action
- [ ] `mitreTechniques` are valid ATT&CK technique IDs (e.g., `T1190`)
- [ ] GRC assessments that cover this chain have a matching `AssessmentAttackPath` with `diagramAttackPathId`
- [ ] All union-typed fields are cast correctly (no TypeScript errors)
