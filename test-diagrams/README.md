# Test Diagrams for Import

This directory contains test diagrams in various formats for testing the import functionality in ContextCypher.

## Available Test Files

### 1. ecommerce-system.mmd (Mermaid)
- **Format**: Mermaid flowchart
- **Description**: E-commerce system architecture with multiple security zones
- **Components**: Web server, load balancer, API gateway, application servers, databases, cache, message queue
- **Usage**: Test Mermaid import with subgraphs and various node types

### 2. banking-system.puml (PlantUML)
- **Format**: PlantUML component diagram
- **Description**: Banking system architecture with security boundaries
- **Components**: Mobile app, web portal, API gateway, microservices, databases, external integrations
- **Usage**: Test PlantUML import with packages, components, and relationships

### 3. microservices.dot (Graphviz)
- **Format**: Graphviz DOT
- **Description**: Microservices architecture with clusters for security zones
- **Components**: API gateway, various services, databases, message broker, monitoring
- **Usage**: Test Graphviz import with subgraphs (clusters) and styled nodes

### 4. healthcare-system.drawio (DrawIO/Diagrams.net)
- **Format**: DrawIO XML
- **Description**: Healthcare system with patient portal, EHR, and integrations
- **Components**: Patient portal, healthcare providers, EHR system, lab systems, pharmacy
- **Usage**: Test DrawIO XML import with mxGraph format

### 5. cloud-architecture.json (JSON)
- **Format**: Generic JSON (ContextCypher-compatible)
- **Description**: Multi-tier cloud application with microservices
- **Components**: CDN, WAF, load balancer, API gateway, microservices, databases
- **Usage**: Test JSON import with pre-defined positions and security zones

## How to Test Import

1. In ContextCypher, click on **File** > **Import Diagram...**
2. Select or drag & drop one of these test files
3. The import dialog will:
   - Detect the format automatically
   - Parse the diagram
   - Convert to ContextCypher format
   - Show any warnings or errors
4. Click **Import** to load the diagram into the editor

## Expected Results

Each test file should successfully import with:
- All nodes converted to appropriate ContextCypher node types
- Connections preserved between components
- Security zones inferred from component names/types
- Automatic layout if positions aren't provided
- Custom context generated with import metadata

## Format-Specific Notes

### Mermaid
- Supports `graph TD`, `graph LR`, `flowchart` directives
- Node types inferred from labels (e.g., "Database", "Web Server")
- Subgraphs mapped to security zones

### PlantUML
- Supports component, database, node, cloud, interface types
- Package boundaries considered for zone inference
- Relationships with labels preserved

### Graphviz
- Supports both `digraph` and `graph` formats
- Node shapes mapped to types (cylinder→database, box3d→server)
- Clusters (subgraphs) provide grouping context

### DrawIO
- Parses mxGraph XML format
- Style attributes used for type inference
- Geometry preserved for positioning

### JSON
- Flexible format supporting various structures
- Can import ContextCypher exports directly
- Supports generic graph formats (nodes/edges, vertices/links)

## Adding New Test Files

To add a new test diagram:
1. Create the diagram in your preferred tool
2. Export in one of the supported formats
3. Place in this directory with descriptive name
4. Update this README with the new file details