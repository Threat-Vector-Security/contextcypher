# DFD (Data Flow Diagram) Threat Modeling Guide

## Overview

ContextCypher now supports traditional Data Flow Diagram (DFD) elements for users who prefer STRIDE threat modeling methodology. These DFD nodes integrate seamlessly with the existing comprehensive threat analysis system while providing familiar notation for security professionals accustomed to traditional threat modeling approaches.

### What's New: Hybrid DFD Methodology

ContextCypher introduces a powerful hybrid approach that allows you to:
1. Use pure DFD nodes for traditional STRIDE threat modeling
2. Apply DFD categorization to ANY existing node type for enhanced analysis
3. Seamlessly transition between abstract modeling and detailed implementation
4. Leverage the best of both methodologies in a single diagram

This guide covers both traditional DFD usage and the innovative hybrid approach.

## DFD Node Types

### 1. DFD External Entity (Actor)
- **Icon**: Circle (○)
- **Purpose**: Represents any external entity that interacts with your system
- **Examples**:
  - Human users
  - Web applications
  - REST APIs
  - Lambda functions
  - Mobile applications
  - Third-party services
  - IoT devices
- **Key Properties**:
  - `actorType`: User-defined string (e.g., "Mobile User", "Payment Gateway", "Admin Console", "IoT Sensor")
  - `trustLevel`: trusted, untrusted, partial
  - `authentication`: Authentication method used
  - `protocols`: Communication protocols

### 2. DFD Process
- **Icon**: Rectangle (□)
- **Purpose**: Represents processing elements that transform data
- **Examples**:
  - Applications
  - Services
  - Functions
  - Microservices
  - Business logic components
- **Key Properties**:
  - `processType`: User-defined string (e.g., "Auth Service", "Order Processing", "Data Validator", "API Handler")
  - `technology`: Implementation technology (e.g., Node.js, Python)
  - `securityControls`: Security measures in place
  - `dataClassification`: Sensitivity of data processed

### 3. DFD Data Store
- **Icon**: Parallel lines (≡)
- **Purpose**: Represents data storage locations
- **Examples**:
  - Databases
  - File systems
  - Cache systems
  - Message queues
  - Blob storage
- **Key Properties**:
  - `storeType`: User-defined string (e.g., "User Database", "Session Cache", "Log Files", "Config Store")
  - `encryption`: atRest, inTransit, both, none
  - `backupStrategy`: Backup and recovery approach
  - `dataClassification`: Data sensitivity level

### 4. DFD Trust Boundary
- **Icon**: Dotted box (⊡)
- **Purpose**: Represents boundaries between different trust levels
- **Examples**:
  - Network boundaries
  - Process boundaries
  - Machine boundaries
  - Privilege boundaries
- **Key Properties**:
  - `boundaryType`: User-defined string (e.g., "Internet Boundary", "Corporate Network", "DMZ Perimeter", "Container Boundary")
  - `fromZone`/`toZone`: Security zones being bridged
  - `controlsAtBoundary`: Security controls at the boundary

## User-Defined Types

One of the key features of DFD nodes in ContextCypher is the flexibility to define your own types. Unlike traditional threat modeling tools that force you into preset categories, ContextCypher allows you to describe components in terms that make sense for your specific system:

### Benefits of User-Defined Types:
- **Domain-Specific Language**: Use terminology familiar to your team and industry
- **Precise Descriptions**: Capture exact component types rather than generic categories
- **Evolution Support**: As systems evolve, you can use new type descriptions without tool limitations
- **Better Analysis**: The AI understands context from your specific descriptions, leading to more accurate threat identification

### Examples:
- Instead of generic "API", use "Payment Processing Gateway" or "GraphQL Federation Service"
- Instead of "Database", use "Customer PII Store" or "Real-time Analytics Cache"
- Instead of "User", use "Healthcare Provider" or "Supply Chain Partner"
- Instead of "Network Boundary", use "HIPAA Compliance Boundary" or "PCI-DSS Isolation Zone"

## Using DFD Nodes in ContextCypher

### 1. Adding DFD Nodes

1. Open the Node Toolbox on the left sidebar
2. Expand the "Threat Modeling (DFD)" category (located below "Security Zones")
3. Drag and drop DFD elements onto your diagram
4. Double-click nodes to edit their properties
5. Enter custom type descriptions in the text fields (with helpful placeholder examples)

### 2. Connecting DFD Elements

- Use regular connection tools to draw data flows between DFD elements
- Data flows are automatically analyzed for security implications
- Edge properties can include:
  - Protocol
  - Encryption status
  - Data classification
  - Authentication requirements

### 3. Mixing DFD with Detailed Nodes

ContextCypher allows you to mix abstract DFD elements with detailed security nodes:
- Start with high-level DFD for initial threat modeling
- Replace DFD elements with specific components as design matures
- Use both in the same diagram for different levels of abstraction

## STRIDE Threat Analysis with DFD

When you run threat analysis on DFD elements, ContextCypher automatically applies STRIDE methodology:

### For External Entities (Actors):
- **Spoofing**: Can the entity be impersonated?
- **Elevation of Privilege**: Can it gain unauthorized access?
- Focus on authentication and input validation

### For Processes:
- **Spoofing**: Authentication weaknesses
- **Tampering**: Input validation and integrity checks
- **Repudiation**: Logging and audit trails
- **Information Disclosure**: Data exposure risks
- **Denial of Service**: Resource exhaustion
- **Elevation of Privilege**: Authorization flaws

### For Data Stores:
- **Tampering**: Data integrity and unauthorized modification
- **Information Disclosure**: Encryption and access controls
- **Denial of Service**: Availability and backup/recovery
- **Repudiation**: Audit logging of data access

### For Trust Boundaries:
- All data crossing the boundary is analyzed
- Authentication/authorization requirements
- Input validation and sanitization needs
- Protocol security and encryption requirements

## Hybrid DFD Methodology (New Feature)

### Overview
ContextCypher's hybrid DFD methodology allows you to add DFD categorization to ANY existing node type. This powerful feature enables:
- Gradual migration from detailed diagrams to DFD threat modeling
- Enhanced STRIDE analysis on existing infrastructure
- Flexibility to use the right level of abstraction for each component

### How It Works

1. **Automatic Categorization**: When you create any node (e.g., server, database, user), it's automatically assigned a DFD category based on its type
2. **Manual Override**: You can change the DFD category or add a specific DFD type in the node properties
3. **Enhanced Analysis**: The AI considers both the specific node type AND its DFD category for deeper insights

### Using Hybrid DFD Features

#### In Node Editor:
1. Double-click any non-DFD node
2. Look for the "DFD Category" dropdown (appears only for categorized nodes)
3. Optionally set or change the category (actor, process, dataStore, trustBoundary)
4. Add a specific "DFD Type" description for more context

#### Automatic Mappings:
- **Actors**: user, smartphone, tablet, laptop, workstation, sensor, hmi, etc.
- **Processes**: server, application, firewall, router, service, etc.
- **Data Stores**: database, cache, vault, storage, ldap, kms, etc.
- **Trust Boundaries**: securityZone

### Benefits of Hybrid Approach:
1. **Best of Both Worlds**: Keep detailed component info while adding DFD context
2. **Gradual Adoption**: No need to rebuild diagrams - enhance existing ones
3. **Richer Analysis**: AI uses both specific properties and DFD patterns
4. **Flexible Abstraction**: Mix detailed and abstract nodes as needed

## Integration with AI Analysis

### Chat Analysis
When discussing your system in the chat, both DFD elements and hybrid categorizations are included:
- The AI understands DFD notation and STRIDE methodology
- DFD categories appear in the Cypher graph representation
- You can ask specific questions about DFD elements or categories
- Examples: 
  - "What are the main threats to the REST API actor?"
  - "Show me all processes in the DMZ zone"
  - "Which data stores contain sensitive information?"

### Threat Analysis
Running threat analysis on diagrams with DFD elements (pure or hybrid):
1. Each element is analyzed based on its DFD category
2. STRIDE categories are applied based on element type:
   - Actors: Focus on Spoofing and Elevation of Privilege
   - Processes: All STRIDE categories apply
   - Data Stores: Focus on Tampering, Information Disclosure, DoS
   - Trust Boundaries: Focus on all data flows crossing
3. Attack paths consider trust boundaries and data flows
4. Results include both generic STRIDE and specific recommendations
5. Hybrid nodes get analysis that combines specific vulnerabilities with DFD patterns

### Progressive Analysis
- DFD categorization enhances progressive threat discovery
- Vulnerabilities in one component inform analysis of connected components
- Trust boundaries are key points for security control recommendations
- The AI tracks how threats propagate through different DFD categories

## Best Practices

### 1. Start High-Level
- Begin with DFD elements for initial threat modeling
- Focus on trust boundaries and data flows
- Identify major external entities and data stores

### 2. Refine Gradually
- Replace generic DFD processes with specific components
- Add security properties to DFD elements
- Document assumptions in node descriptions
- Use hybrid categorization to enhance existing diagrams

### 3. Trust Boundaries Are Critical
- Always define trust boundaries between zones
- Document controls at each boundary
- Consider both network and privilege boundaries
- Use security zones as natural trust boundaries

### 4. Leverage Both Approaches
- Use pure DFD for architecture overview and early design
- Use detailed nodes for implementation specifics
- Apply hybrid categorization to bridge the gap
- Mix all approaches in areas of different maturity

### 5. Hybrid Best Practices
- Review auto-assigned categories and adjust if needed
- Add specific DFD types to provide context (e.g., "Payment Gateway" vs generic "Process")
- Use categories to group similar components for analysis
- Let the AI leverage both detailed properties and DFD patterns

## Example Scenarios

### Traditional DFD Approach
```
[Mobile Application Users] --HTTPS--> [E-Commerce API Gateway] --TLS--> [Customer Profile Database]
        ^                                    |
        |                                    |
     External                          [DMZ to Internal Network Boundary]
```
- Uses pure DFD nodes with custom types
- Focus on data flows and trust boundaries
- High-level view for initial threat modeling

### Hybrid Approach Example
Starting with existing detailed nodes:
1. **nginx** (server) → Auto-categorized as "process"
2. **PostgreSQL** (database) → Auto-categorized as "dataStore"
3. **Mobile App** (smartphone) → Auto-categorized as "actor"

Then enhance with DFD types:
- nginx → DFD Type: "Web Application Gateway"
- PostgreSQL → DFD Type: "Customer Data Repository"
- Mobile App → DFD Type: "End User Application"

This provides both specific vulnerability analysis AND STRIDE patterns.

### Migration Scenario
```
Phase 1: Pure DFD
[External User] --> [Web Process] --> [Database]

Phase 2: Hybrid (add details while keeping DFD context)
[smartphone: "Mobile User"] --> [nginx: "API Gateway"] --> [postgresql: "User DB"]
   (actor)                        (process)                    (dataStore)

Phase 3: Full Detail (with DFD categories for STRIDE)
[iPhone 15 Pro] --> [nginx 1.24.0] --> [PostgreSQL 15.3]
DFD: actor          DFD: process        DFD: dataStore
```

### Complex System with Mixed Abstraction
```
[Detailed Section]
smartphone(iOS 17) --> nginx(1.24) --> kubernetes pod --> postgresql(15.3)
                                           |
                                           v
                                    [Abstract Section]
                                    [Processing Engine] --> [Analytics Store]
                                    (DFD Process)          (DFD Data Store)
```

## Technical Implementation Details

### Core DFD Implementation
The DFD integration involved updates to:
- `src/types/SecurityTypes.ts`: Added DFD node types and interfaces
- `src/components/NodeToolbox.tsx`: Added DFD category with nodes
- `src/components/SecurityNodes.tsx`: Added rendering configuration
- `server/services/SimplifiedThreatAnalyzer.js`: Enhanced threat analysis for DFD
- `src/components/AnalysisContextProvider.tsx`: Ensured DFD properties in context

### Hybrid DFD Implementation
The hybrid categorization feature added:
- `src/types/SecurityTypes.ts`: Added `dfdCategory` and `dfdType` to BaseNodeData
- `src/utils/dfdCategoryMappings.ts`: Created comprehensive mappings for 200+ node types
- `src/components/NodeEditor.tsx`: Added UI for DFD categorization
- `src/components/DiagramEditor.tsx`: Auto-categorization on node creation
- `server/utils/formatters.js`: Include DFD fields in analysis context
- `src/services/AIRequestService.ts`: Display DFD info in chat context

### Data Model

#### Pure DFD Nodes:
- `DFDActorNodeData`: External entity properties (actorType, trustLevel, authentication)
- `DFDProcessNodeData`: Processing element properties (processType, technology, securityControls)
- `DFDDataStoreNodeData`: Storage properties (storeType, encryption, backupStrategy)
- `DFDTrustBoundaryNodeData`: Boundary properties (boundaryType, fromZone, toZone, controlsAtBoundary)

#### Hybrid Enhancement:
- `BaseNodeData.dfdCategory`: Optional DFD categorization (actor|process|dataStore|trustBoundary)
- `BaseNodeData.dfdType`: Optional specific type description

### Analysis Pipeline
1. **Node Analysis**: Each node is analyzed considering both its specific type and DFD category
2. **Context Building**: DFD fields are included in prompts and Cypher representations
3. **STRIDE Application**: Category-specific STRIDE analysis is applied
4. **Attack Path Generation**: Trust boundaries and data flows guide path discovery

All DFD nodes (pure and hybrid) participate in the same analysis pipeline as regular nodes, ensuring consistent threat identification and reporting.

## Troubleshooting

### DFD Nodes Not Appearing
- Ensure you've expanded the "Threat Modeling (DFD)" category
- Check that your browser is refreshed after updates
- Verify the Node Toolbox is visible (toggle with sidebar button)

### Analysis Not Working
- DFD nodes must have labels to be properly analyzed
- Trust boundaries need at least basic properties set
- Check the debug panel (F12) for any errors

### Properties Not Saving
- Double-click nodes to open property editor
- Ensure you click outside the editor to save
- Some properties have specific formats (e.g., lists)

## Recent Enhancements

### User-Defined Types (Implemented)
- Replaced preset dropdown values with flexible text input fields
- Added helpful placeholders with examples to guide users
- Supports any custom type description for better domain-specific modeling

## Future Enhancements

Planned improvements for DFD support:
- Visual differentiation with traditional DFD shapes
- STRIDE threat templates for common patterns
- Auto-generation of trust boundaries from zones
- DFD-specific report formatting options
- Import from threat modeling tools
- Type suggestions based on common patterns
- Auto-completion for frequently used types

## Conclusion

The DFD threat modeling integration in ContextCypher bridges traditional security analysis with modern AI-powered threat detection. Whether you prefer abstract DFD notation or detailed component modeling, ContextCypher supports your workflow while providing comprehensive security analysis.