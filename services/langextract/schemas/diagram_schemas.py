"""
Pydantic schemas for diagram structure extraction
"""
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Literal

class Position(BaseModel):
    """2D position on diagram canvas"""
    x: float = Field(description="X coordinate on diagram canvas")
    y: float = Field(description="Y coordinate on diagram canvas")

class DiagramComponent(BaseModel):
    """Individual component in system architecture diagram"""
    id: str = Field(description="Unique identifier for the component")
    type: Literal[
        "cloud-service", "server", "client-device", "web-app", "api", "database", 
        "firewall", "load-balancer", "external-service", "mobile-app", "iot-device",
        "container", "microservice", "queue", "cache", "storage", "browser",
        "desktop-app", "network", "security-zone", "lambda", "cdn", "dns",
        "vpc", "subnet", "gateway", "router", "switch", "monitoring",
        "logging", "authentication", "authorization", "message-broker"
    ] = Field(description="Component type from predefined list")
    label: str = Field(description="Display name for the component")
    zone: Optional[Literal["External", "DMZ", "Internal", "Trusted", "Cloud", "On-Premise"]] = Field(
        default=None, 
        description="Security zone where component resides"
    )
    ports: Optional[List[str]] = Field(
        default=None,
        description="Network ports used by component (e.g., ['80', '443', '3306'])"
    )
    protocols: Optional[List[str]] = Field(
        default=None,
        description="Protocols supported by component (e.g., ['HTTP', 'HTTPS', 'TCP'])"
    )
    position: Optional[Position] = Field(
        default=None,
        description="Position on diagram canvas"
    )
    metadata: Optional[Dict[str, str]] = Field(
        default=None,
        description="Additional component properties (e.g., version, vendor, criticality)"
    )
    hosting: Optional[str] = Field(
        default=None,
        description="Where component is hosted (e.g., 'AWS', 'Azure', 'On-Premise')"
    )
    technology_stack: Optional[List[str]] = Field(
        default=None,
        description="Technologies used (e.g., ['Python', 'PostgreSQL', 'Redis'])"
    )

class Connection(BaseModel):
    """Connection between two components"""
    id: str = Field(description="Unique identifier for connection")
    source: str = Field(description="Source component ID")
    target: str = Field(description="Target component ID")
    label: Optional[str] = Field(
        default=None,
        description="Connection description or data flow type"
    )
    protocol: Optional[str] = Field(
        default=None,
        description="Communication protocol (e.g., 'HTTPS', 'TCP', 'WebSocket')"
    )
    port: Optional[str] = Field(
        default=None,
        description="Port number if applicable (e.g., '443', '5432')"
    )
    dataFlow: Optional[str] = Field(
        default=None,
        description="Type of data flowing (e.g., 'User Data', 'API Requests', 'Database Queries')"
    )
    encrypted: Optional[bool] = Field(
        default=True,
        description="Whether connection is encrypted"
    )
    authentication: Optional[str] = Field(
        default=None,
        description="Authentication method used (e.g., 'OAuth2', 'API Key', 'mTLS')"
    )
    bidirectional: Optional[bool] = Field(
        default=False,
        description="Whether data flows in both directions"
    )
    metadata: Optional[Dict[str, str]] = Field(
        default=None,
        description="Additional connection properties"
    )

class DiagramStructure(BaseModel):
    """Complete system architecture diagram structure"""
    title: str = Field(description="Diagram title describing the system")
    description: Optional[str] = Field(
        default=None,
        description="Detailed description of the architecture"
    )
    components: List[DiagramComponent] = Field(
        description="All components in the diagram"
    )
    connections: List[Connection] = Field(
        description="All connections between components"
    )
    architecture_type: Optional[Literal[
        "microservices", "monolithic", "serverless", "hybrid", "event-driven",
        "layered", "client-server", "peer-to-peer", "service-oriented"
    ]] = Field(
        default=None,
        description="Type of architecture pattern detected"
    )
    deployment_model: Optional[Literal[
        "cloud", "on-premise", "hybrid", "multi-cloud", "edge"
    ]] = Field(
        default=None,
        description="Deployment model for the system"
    )
    security_controls: Optional[List[str]] = Field(
        default=None,
        description="Security controls present (e.g., ['Firewall', 'WAF', 'IDS', 'Encryption'])"
    )
    compliance_frameworks: Optional[List[str]] = Field(
        default=None,
        description="Compliance frameworks considered (e.g., ['PCI-DSS', 'HIPAA', 'GDPR'])"
    )
    metadata: Optional[Dict[str, str]] = Field(
        default=None,
        description="Additional diagram metadata"
    )

class DiagramExtractionRequest(BaseModel):
    """Request model for diagram extraction"""
    ai_response: str = Field(description="Raw AI response containing diagram information")
    context: Dict[str, str] = Field(
        default={},
        description="Context about the diagram request"
    )
    provider: Optional[str] = Field(
        default=None,
        description="AI provider used for generation"
    )
    extraction_hints: Optional[Dict[str, str]] = Field(
        default=None,
        description="Hints to guide extraction (e.g., expected component types)"
    )

class DiagramExtractionResponse(BaseModel):
    """Response model for diagram extraction"""
    success: bool = Field(description="Whether extraction was successful")
    diagram: Optional[DiagramStructure] = Field(
        default=None,
        description="Extracted diagram structure"
    )
    confidence_scores: Optional[Dict[str, float]] = Field(
        default=None,
        description="Confidence scores for each extracted element"
    )
    source_attributions: Optional[Dict[str, str]] = Field(
        default=None,
        description="Source text for each extracted element"
    )
    warnings: Optional[List[str]] = Field(
        default=None,
        description="Any warnings during extraction"
    )
    extraction_metadata: Optional[Dict[str, any]] = Field(
        default=None,
        description="Metadata about the extraction process"
    )