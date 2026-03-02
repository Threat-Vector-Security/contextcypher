# Cypher Graph Format Optimization for AI Analysis

## Overview

This document demonstrates the token optimization achieved by converting from JSON to Cypher graph format for AI analysis.

## Token Comparison Example

### Original JSON Format (from vulnerableWebApp.ts)
```json
{
  "nodes": [
    {
      "id": "web-server",
      "type": "webServer",
      "position": { "x": 1200, "y": 400 },
      "data": {
        "label": "Web Server",
        "description": "Apache HTTP Server",
        "vendor": "apache",
        "product": "httpd",
        "zone": "DMZ",
        "securityLevel": "Standard",
        "dataClassification": "Internal",
        "protocols": ["HTTP", "HTTPS"],
        "version": "2.4.29",
        "securityControls": ["SSL Termination", "ModSecurity WAF"]
      }
    },
    {
      "id": "load-balancer",
      "type": "loadBalancer",
      "position": { "x": 1300, "y": 400 },
      "data": {
        "label": "Load Balancer",
        "description": "HAProxy Load Balancer",
        "vendor": "haproxy",
        "product": "haproxy",
        "zone": "DMZ",
        "securityLevel": "Standard",
        "dataClassification": "Internal",
        "version": "2.3",
        "protocols": ["HTTP", "HTTPS"],
        "securityControls": ["SSL Termination"]
      }
    }
  ],
  "edges": [
    {
      "id": "web-to-lb",
      "source": "web-server",
      "target": "load-balancer",
      "type": "securityEdge",
      "sourceHandle": "right",
      "targetHandle": "left",
      "data": {
        "label": "Web Traffic",
        "protocol": "HTTP/HTTPS",
        "encryption": "TLS",
        "securityLevel": "Standard",
        "dataClassification": "Internal",
        "zone": "DMZ"
      }
    }
  ]
}
```
**Token Count: ~550 tokens**

### Optimized Cypher Format
```cypher
CREATE (:WebServer:SecurityNode {id:'web-server',label:'Web Server',zone:'DMZ',securityLevel:'Standard',dataClassification:'Internal',vendor:'apache',product:'httpd',version:'2.4.29',protocols:'HTTP,HTTPS',securityControls:'SSL Termination,ModSecurity WAF'})
CREATE (:LoadBalancer:SecurityNode {id:'load-balancer',label:'Load Balancer',zone:'DMZ',securityLevel:'Standard',dataClassification:'Internal',vendor:'haproxy',product:'haproxy',version:'2.3',protocols:'HTTP,HTTPS',securityControls:'SSL Termination'})
MATCH (a {id:'web-server'}),(b {id:'load-balancer'}) CREATE (a)-[:CONNECTS_HTTP_HTTPS {id:'web-to-lb',encryption:'TLS',zone:'DMZ',label:'Web Traffic'}]->(b)
```
**Token Count: ~120 tokens**

**Reduction: 78% fewer tokens for this snippet**

## Full vulnerableWebApp.ts Comparison

### Before (JSON):
- 63 nodes × ~250 tokens/node = 15,750 tokens
- 89 edges × ~100 tokens/edge = 8,900 tokens
- Total diagram: ~24,650 tokens

### After (Cypher):
- 63 nodes × ~40 tokens/node = 2,520 tokens
- 89 edges × ~25 tokens/edge = 2,225 tokens
- Total diagram: ~4,745 tokens

**Total Reduction: 80.7% fewer tokens**

## Benefits of Cypher Format

1. **Compact Representation**: Eliminates redundant JSON structure overhead
2. **Relationship-Focused**: Natural expression of connections between components
3. **No Position Data**: UI-specific coordinates aren't needed for security analysis
4. **Compressed Properties**: Only non-default values are included
5. **Native Graph Format**: AI can better understand network relationships

## Token Window Impact

### Standard 8K Context Window
- **Before**: Diagram alone consumes ~25K tokens (exceeds window!)
- **After**: Diagram uses ~5K tokens, leaving 3K for conversation

### Extended 32K Context Window
- **Before**: Can fit diagram + ~7K tokens of conversation
- **After**: Can fit diagram + ~27K tokens of conversation (385% more!)

### 128K Context Window
- **Before**: Can analyze 5 medium diagrams simultaneously
- **After**: Can analyze 25+ medium diagrams simultaneously

## Implementation Details

The conversion happens in `AnalysisContextProvider.tsx`:

1. User saves/loads diagrams in familiar JSON format
2. When sending to AI, the `diagramToCypher()` function converts to graph format
3. AI receives compact Cypher representation
4. Response processing remains unchanged

## AI Prompt Updates

The AI system prompts should be updated to understand the new format:

```
The system architecture is provided in Cypher graph query format. Each CREATE statement 
defines a node with its security properties. MATCH statements define connections between 
nodes with their communication protocols and security attributes.

Example:
CREATE (:Server:SecurityNode {id:'web-1',label:'Web Server',zone:'DMZ'})
This creates a server node in the DMZ zone.

CREATE (a)-[:CONNECTS_HTTPS {encryption:'TLS'}]->(b)
This creates an HTTPS connection with TLS encryption between nodes a and b.
```

## Enhanced Threat Analysis Mode

When performing dedicated threat analysis (vs. general chat), the system provides additional context to guide adversarial thinking:

### Attack Surface Analysis Context
```
=== ATTACK SURFACE ANALYSIS ===
The system is represented in Cypher graph format below. 
Key relationships to analyze:
- External → Internal connections (entry points)
- Unencrypted connections (encryption:'none')
- Cross-zone connections (trust boundaries)
- Components with no security controls listed
- Outdated versions with known vulnerabilities

=== ANALYSIS APPROACH ===
1. Identify all external entry points
2. Trace paths following least resistance (weak auth, unencrypted, unpatched)
3. Consider attacker objectives (data exfiltration, service disruption, lateral movement)
4. Evaluate where dynamic defenses would most disrupt attack chains
```

### Attack Path Analysis Framework

The enhanced threat analysis uses an adversarial mindset with focus on:

1. **Entry Point Identification**:
   - Components exposed to untrusted zones (Internet/External/DMZ)
   - Services with authentication interfaces (especially default/weak auth)
   - Components with known vulnerabilities (outdated versions)
   - Trust boundaries where security controls are weakest

2. **Path Analysis - Follow Least Resistance**:
   - Unencrypted connections (especially crossing trust boundaries)
   - Shared/default credentials that enable lateral movement
   - Components missing security controls in their zone
   - Paths that bypass security controls (direct connections that shouldn't exist)
   - Legacy/unpatched systems that can't be easily updated

3. **Attack Chain Construction**:
   - Initial foothold → Lateral movement → Privilege escalation → Objective
   - Consider attacker dwell time and detection likelihood at each step
   - Identify "pivot points" where attackers gain significant new access

4. **Dynamic Defense Considerations (MTD)**:
   - Which attack paths rely on static configurations?
   - Where would changing configurations break attack chains?
   - Which paths would force attackers to "start over" if disrupted?

### Example Enhanced Output
```
PATH: Internet → Load Balancer (DMZ) → App Server 1 (Internal) → Primary Database (Restricted)
SQL injection via unpatched Apache Commons FileUpload (CVE-2016-1000031) on App Server 1, 
leveraging direct database connection that bypasses DB firewall. Attacker can exfiltrate 
customer data via established HTTPS channel.
LIKELIHOOD: Likely | IMPACT: Catastrophic | RISK: Extreme | MITRE: T1190,T1005,T1041

Analysis: This path exploits:
- Known vulnerability in outdated component
- Direct connection that violates security architecture (should go through DB firewall)
- Unencrypted internal MySQL traffic enables credential capture
- Static configuration allows persistent access once compromised

Dynamic Defense Impact: Port randomization on internal connections would force attacker 
to re-scan. Application diversity (rotating between Tomcat/JBoss/WebLogic) would 
invalidate version-specific exploits.
```

## Differentiation: Chat vs Threat Analysis

The system distinguishes between two analysis modes:

### General Chat Analysis
- Uses simplified Cypher context
- Focuses on answering questions about the architecture
- Provides design recommendations and explanations
- No adversarial mindset required

### Dedicated Threat Analysis
- Includes enhanced attack surface context
- Applies adversarial thinking framework
- Identifies realistic attack paths following least resistance
- Considers dynamic defense (MTD) disruption points
- Provides MITRE ATT&CK technique mappings

This differentiation ensures:
- Chat responses remain focused and helpful without security jargon overload
- Threat analysis provides deep, actionable security insights
- AI instructions remain clear and mode-appropriate

## Conclusion

By switching to Cypher format for AI analysis while maintaining JSON for user interactions, we achieve:

- **80% reduction in token usage** for diagram representation
- **5x more conversation history** can fit in the same context window
- **Better semantic understanding** of network relationships by the AI
- **Enhanced threat modeling** with adversarial mindset for dedicated analysis
- **No user experience changes** - they still work with familiar JSON format 