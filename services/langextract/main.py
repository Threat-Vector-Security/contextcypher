"""
LangExtract Threat Intelligence Service
Extracts structured threat intelligence from raw data using AI
"""

import os
import json
import logging
from typing import Dict, Any, List, Optional
from datetime import datetime

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import uvicorn
from langextract import DocumentExtractor
from langextract.schemas import SchemaSpec, FieldSpec, FieldType

from ai_providers import get_ai_client, AIProviderConfig
from diagram_extractor import DiagramExtractor
from schemas.diagram_schemas import DiagramExtractionRequest, DiagramExtractionResponse

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="LangExtract Threat Intelligence Service")

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001", "http://localhost:3002"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Define threat intelligence schema for LangExtract
THREAT_INTEL_SCHEMA = SchemaSpec(
    name="ThreatIntelligence",
    description="Structured threat intelligence extracted from various sources",
    fields=[
        FieldSpec(
            name="threat_actors",
            type=FieldType.STRING_LIST,
            description="Names and descriptions of threat actors, APT groups, or adversaries",
            required=False
        ),
        FieldSpec(
            name="attack_patterns",
            type=FieldType.STRING_LIST,
            description="Attack techniques, tactics, and procedures (TTPs) including MITRE ATT&CK techniques",
            required=False
        ),
        FieldSpec(
            name="vulnerabilities",
            type=FieldType.STRING_LIST,
            description="CVE IDs and vulnerability descriptions relevant to the system",
            required=False
        ),
        FieldSpec(
            name="indicators_of_compromise",
            type=FieldType.STRING_LIST,
            description="IOCs including IPs, domains, file hashes, URLs, and other observables",
            required=False
        ),
        FieldSpec(
            name="campaigns",
            type=FieldType.STRING_LIST,
            description="Active threat campaigns, their targets, and methodologies",
            required=False
        ),
        FieldSpec(
            name="mitigations",
            type=FieldType.STRING_LIST,
            description="Recommended security controls, patches, and defensive measures",
            required=False
        ),
        FieldSpec(
            name="risk_assessment",
            type=FieldType.STRING,
            description="Overall risk level and assessment based on the threat intelligence",
            required=False
        ),
        FieldSpec(
            name="timeline",
            type=FieldType.STRING_LIST,
            description="Important dates and timeline of threats or incidents",
            required=False
        ),
        FieldSpec(
            name="targeted_sectors",
            type=FieldType.STRING_LIST,
            description="Industries, sectors, or technologies being targeted",
            required=False
        ),
        FieldSpec(
            name="tools_used",
            type=FieldType.STRING_LIST,
            description="Malware, exploits, and tools used by threat actors",
            required=False
        )
    ]
)

class ThreatIntelRequest(BaseModel):
    """Request model for threat intelligence extraction"""
    raw_content: str = Field(..., description="Raw threat intelligence content to parse")
    diagram_context: Dict[str, Any] = Field(..., description="Current diagram context for relevance filtering")
    ai_config: AIProviderConfig = Field(..., description="AI provider configuration from SimplifiedThreatAnalyzer")
    max_tokens: Optional[int] = Field(2000, description="Maximum tokens for response")
    
class ThreatIntelResponse(BaseModel):
    """Response model for extracted threat intelligence"""
    extracted_intel: Dict[str, Any] = Field(..., description="Structured threat intelligence")
    relevance_scores: Dict[str, float] = Field(..., description="Relevance scores for each field")
    source_attributions: Dict[str, List[str]] = Field(..., description="Source text for each extraction")
    metadata: Dict[str, Any] = Field(..., description="Extraction metadata")

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "langextract-threat-intel", "timestamp": datetime.utcnow().isoformat()}

@app.post("/extract", response_model=ThreatIntelResponse)
async def extract_threat_intelligence(request: ThreatIntelRequest):
    """Extract structured threat intelligence from raw content"""
    try:
        # Get AI client based on provided configuration
        ai_client = get_ai_client(request.ai_config)
        
        # Create context prompt based on diagram
        diagram_summary = _summarize_diagram_context(request.diagram_context)
        context_prompt = f"""
        You are analyzing threat intelligence for the following system:
        {diagram_summary}
        
        Extract only threat intelligence that is relevant to this specific system architecture.
        Focus on threats that could impact the components, connections, and security boundaries shown.
        """
        
        # Initialize LangExtract with the AI client
        extractor = DocumentExtractor(
            model=ai_client,
            schema=THREAT_INTEL_SCHEMA,
            context_prompt=context_prompt
        )
        
        # Extract structured data with source grounding
        extraction_result = await extractor.extract(
            document=request.raw_content,
            include_sources=True,
            max_tokens=request.max_tokens
        )
        
        # Calculate relevance scores based on diagram context
        relevance_scores = _calculate_relevance_scores(
            extraction_result.data,
            request.diagram_context
        )
        
        # Filter out low-relevance items
        filtered_intel = _filter_by_relevance(
            extraction_result.data,
            relevance_scores,
            threshold=0.3
        )
        
        return ThreatIntelResponse(
            extracted_intel=filtered_intel,
            relevance_scores=relevance_scores,
            source_attributions=extraction_result.sources,
            metadata={
                "extraction_timestamp": datetime.utcnow().isoformat(),
                "model_used": request.ai_config.model,
                "provider": request.ai_config.provider,
                "total_items": len(extraction_result.data),
                "filtered_items": len(filtered_intel),
                "extraction_confidence": extraction_result.confidence
            }
        )
        
    except Exception as e:
        logger.error(f"Error extracting threat intelligence: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Extraction failed: {str(e)}")

def _summarize_diagram_context(diagram_context: Dict[str, Any]) -> str:
    """Create a summary of the diagram for context"""
    nodes = diagram_context.get("nodes", [])
    edges = diagram_context.get("edges", [])
    
    # Extract key components
    node_types = {}
    for node in nodes:
        node_type = node.get("type", "Unknown")
        node_types[node_type] = node_types.get(node_type, 0) + 1
    
    # Build summary
    summary_parts = [
        f"System with {len(nodes)} components and {len(edges)} connections."
    ]
    
    if node_types:
        summary_parts.append("Component types: " + ", ".join([
            f"{count} {node_type}" for node_type, count in node_types.items()
        ]))
    
    # Add security zones if present
    zones = set()
    for node in nodes:
        if zone := node.get("data", {}).get("zone"):
            zones.add(zone)
    
    if zones:
        summary_parts.append(f"Security zones: {', '.join(zones)}")
    
    # Add key technologies
    technologies = set()
    for node in nodes:
        label = node.get("data", {}).get("label", "").lower()
        if "api" in label:
            technologies.add("APIs")
        if "database" in label or "db" in label:
            technologies.add("Databases")
        if "web" in label or "frontend" in label:
            technologies.add("Web Applications")
        if "cloud" in label:
            technologies.add("Cloud Services")
    
    if technologies:
        summary_parts.append(f"Technologies: {', '.join(technologies)}")
    
    return " ".join(summary_parts)

def _calculate_relevance_scores(extracted_data: Dict[str, Any], diagram_context: Dict[str, Any]) -> Dict[str, float]:
    """Calculate relevance scores for extracted intelligence based on diagram"""
    scores = {}
    
    # Get diagram components for matching
    diagram_text = []
    for node in diagram_context.get("nodes", []):
        data = node.get("data", {})
        diagram_text.extend([
            data.get("label", "").lower(),
            data.get("type", "").lower(),
            data.get("zone", "").lower()
        ])
    
    diagram_text = " ".join(filter(None, diagram_text))
    
    # Score each field based on relevance to diagram
    for field, values in extracted_data.items():
        if not values:
            scores[field] = 0.0
            continue
            
        if isinstance(values, list):
            # Check how many items match diagram components
            matches = 0
            for value in values:
                if isinstance(value, str):
                    value_lower = value.lower()
                    # Check for technology/component matches
                    if any(component in value_lower for component in diagram_text.split() if len(component) > 3):
                        matches += 1
            
            scores[field] = min(1.0, matches / max(1, len(values)))
        else:
            # For single values, check if it mentions diagram components
            value_str = str(values).lower()
            component_mentions = sum(1 for component in diagram_text.split() 
                                   if len(component) > 3 and component in value_str)
            scores[field] = min(1.0, component_mentions * 0.2)
    
    return scores

def _filter_by_relevance(data: Dict[str, Any], scores: Dict[str, float], threshold: float) -> Dict[str, Any]:
    """Filter intelligence data by relevance threshold"""
    filtered = {}
    
    for field, value in data.items():
        if scores.get(field, 0) >= threshold:
            filtered[field] = value
    
    return filtered

@app.post("/api/diagram/extract", response_model=DiagramExtractionResponse)
async def extract_diagram_structure(request: DiagramExtractionRequest):
    """Extract structured diagram data from AI response"""
    try:
        # Use the same AI provider configuration approach
        provider_name = request.provider or "ollama"
        
        # Initialize diagram extractor
        extractor = DiagramExtractor(provider_name=provider_name)
        
        # Extract diagram structure
        result = await extractor.extract_diagram_structure(
            ai_response=request.ai_response,
            context=request.context
        )
        
        return result
        
    except Exception as e:
        logger.error(f"Error extracting diagram structure: {str(e)}")
        return DiagramExtractionResponse(
            success=False,
            warnings=[str(e)],
            extraction_metadata={"error": str(e)}
        )

if __name__ == "__main__":
    port = int(os.environ.get("LANGEXTRACT_PORT", 8001))
    uvicorn.run(app, host="0.0.0.0", port=port)