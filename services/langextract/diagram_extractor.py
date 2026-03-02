"""
Diagram structure extraction using LangExtract
"""
import asyncio
import logging
from typing import Dict, Optional, List
import re

from .schemas.diagram_schemas import (
    DiagramStructure, DiagramComponent, Connection, 
    Position, DiagramExtractionRequest, DiagramExtractionResponse
)
from .ai_providers import get_ai_provider

logger = logging.getLogger(__name__)

class DiagramExtractor:
    """Extract structured diagram data from AI responses"""
    
    def __init__(self, provider_name: str = "ollama"):
        self.provider_name = provider_name
        self.provider = get_ai_provider(provider_name)
    
    async def extract_diagram_structure(
        self, 
        ai_response: str, 
        context: Optional[Dict[str, str]] = None
    ) -> DiagramExtractionResponse:
        """
        Extract structured diagram data from AI response
        
        Args:
            ai_response: Raw AI response text
            context: Additional context about the diagram request
            
        Returns:
            DiagramExtractionResponse with extracted structure
        """
        try:
            # Build extraction prompt
            prompt = self._build_extraction_prompt(ai_response, context or {})
            
            # Get structured extraction from AI
            extraction_response = await self._extract_with_ai(prompt)
            
            # Parse and validate the extraction
            diagram = self._parse_extraction(extraction_response, ai_response)
            
            # Calculate confidence scores
            confidence_scores = self._calculate_confidence(diagram, ai_response)
            
            # Get source attributions
            source_attributions = self._get_source_attributions(diagram, ai_response)
            
            return DiagramExtractionResponse(
                success=True,
                diagram=diagram,
                confidence_scores=confidence_scores,
                source_attributions=source_attributions,
                extraction_metadata={
                    "provider": self.provider_name,
                    "original_length": len(ai_response),
                    "component_count": len(diagram.components),
                    "connection_count": len(diagram.connections)
                }
            )
            
        except Exception as e:
            logger.error(f"Diagram extraction failed: {str(e)}")
            return DiagramExtractionResponse(
                success=False,
                warnings=[str(e)],
                extraction_metadata={"error": str(e)}
            )
    
    def _build_extraction_prompt(self, ai_response: str, context: Dict[str, str]) -> str:
        """Build prompt for structured extraction"""
        user_prompt = context.get('user_prompt', 'system architecture')
        diagram_type = context.get('diagram_type', 'general')
        
        return f"""
Extract the system architecture diagram structure from the following AI response.
The response may be in Cypher format, JSON, or natural language description.

User requested: {user_prompt}
Diagram type: {diagram_type}

IMPORTANT: Extract ONLY the information explicitly mentioned in the AI response.
Do not infer or add components not mentioned.

For each component, identify:
- A unique ID (can be derived from the label)
- The type (from the allowed types list)
- The label/name
- Security zone if mentioned
- Any ports, protocols, or technology stack mentioned
- Position if specified

For each connection, identify:
- Source and target component IDs
- Protocol if mentioned
- Port if mentioned
- Whether it's encrypted
- Data flow type if mentioned
- Authentication method if mentioned

Also identify:
- The overall architecture type (microservices, monolithic, etc.)
- Deployment model (cloud, on-premise, hybrid)
- Any security controls mentioned

AI Response to analyze:
{ai_response}

Provide the extraction in the following JSON format:
{{
    "title": "extracted title",
    "description": "brief description",
    "components": [
        {{
            "id": "component1",
            "type": "server",
            "label": "Web Server",
            "zone": "DMZ",
            "ports": ["80", "443"],
            "protocols": ["HTTP", "HTTPS"]
        }}
    ],
    "connections": [
        {{
            "id": "conn1",
            "source": "component1",
            "target": "component2",
            "protocol": "HTTPS",
            "port": "443",
            "encrypted": true
        }}
    ],
    "architecture_type": "microservices",
    "deployment_model": "cloud"
}}
"""
    
    async def _extract_with_ai(self, prompt: str) -> str:
        """Use AI provider to extract structured data"""
        messages = [
            {"role": "system", "content": "You are a diagram structure extraction assistant. Extract only the information explicitly provided in the text."},
            {"role": "user", "content": prompt}
        ]
        
        response = await self.provider.generate(messages)
        return response
    
    def _parse_extraction(self, extraction_response: str, original_response: str) -> DiagramStructure:
        """Parse the AI extraction into DiagramStructure"""
        import json
        
        # Try to extract JSON from the response
        json_match = re.search(r'\{[\s\S]*\}', extraction_response)
        if json_match:
            try:
                data = json.loads(json_match.group())
                
                # Convert to DiagramStructure
                components = []
                for comp_data in data.get('components', []):
                    component = DiagramComponent(
                        id=comp_data['id'],
                        type=self._normalize_component_type(comp_data.get('type', 'server')),
                        label=comp_data['label'],
                        zone=comp_data.get('zone'),
                        ports=comp_data.get('ports'),
                        protocols=comp_data.get('protocols'),
                        position=Position(**comp_data['position']) if 'position' in comp_data else None,
                        metadata=comp_data.get('metadata')
                    )
                    components.append(component)
                
                connections = []
                for conn_data in data.get('connections', []):
                    connection = Connection(
                        id=conn_data.get('id', f"conn_{len(connections)}"),
                        source=conn_data['source'],
                        target=conn_data['target'],
                        label=conn_data.get('label'),
                        protocol=conn_data.get('protocol'),
                        port=conn_data.get('port'),
                        dataFlow=conn_data.get('dataFlow'),
                        encrypted=conn_data.get('encrypted', True),
                        authentication=conn_data.get('authentication'),
                        bidirectional=conn_data.get('bidirectional', False),
                        metadata=conn_data.get('metadata')
                    )
                    connections.append(connection)
                
                return DiagramStructure(
                    title=data.get('title', 'System Architecture'),
                    description=data.get('description'),
                    components=components,
                    connections=connections,
                    architecture_type=data.get('architecture_type'),
                    deployment_model=data.get('deployment_model'),
                    security_controls=data.get('security_controls'),
                    compliance_frameworks=data.get('compliance_frameworks'),
                    metadata=data.get('metadata')
                )
                
            except json.JSONDecodeError as e:
                logger.error(f"Failed to parse extraction JSON: {e}")
                # Fall back to basic extraction from original response
                return self._fallback_extraction(original_response)
        
        return self._fallback_extraction(original_response)
    
    def _normalize_component_type(self, type_str: str) -> str:
        """Normalize component type to allowed values"""
        type_map = {
            'webapp': 'web-app',
            'webserver': 'server',
            'appserver': 'server',
            'db': 'database',
            'mobileapp': 'mobile-app',
            'iot': 'iot-device',
            'lb': 'load-balancer',
            'fw': 'firewall',
            'external': 'external-service',
            'service': 'microservice',
            'function': 'lambda',
            'broker': 'message-broker',
            'auth': 'authentication'
        }
        
        normalized = type_str.lower().replace(' ', '-').replace('_', '-')
        return type_map.get(normalized, normalized)
    
    def _fallback_extraction(self, ai_response: str) -> DiagramStructure:
        """Basic extraction when AI extraction fails"""
        # This is a simplified fallback - in production, this could use
        # the existing regex patterns from DiagramGenerationService
        components = []
        connections = []
        
        # Look for component patterns
        comp_patterns = [
            r'(?:CREATE|create)\s+\((\w+):([^)]+)\)',  # Cypher CREATE
            r'"(\w+)":\s*\{\s*"type":\s*"([^"]+)"',    # JSON format
        ]
        
        for pattern in comp_patterns:
            for match in re.finditer(pattern, ai_response):
                comp_id = match.group(1)
                comp_type = match.group(2)
                components.append(DiagramComponent(
                    id=comp_id,
                    type=self._normalize_component_type(comp_type),
                    label=comp_id.replace('_', ' ').title()
                ))
        
        # Look for connection patterns
        conn_patterns = [
            r'\((\w+)\)-\[:([^\]]+)\]->\((\w+)\)',  # Cypher relationships
            r'"source":\s*"(\w+)",\s*"target":\s*"(\w+)"',  # JSON format
        ]
        
        for pattern in conn_patterns:
            for match in re.finditer(pattern, ai_response):
                if len(match.groups()) == 3:
                    source, rel_type, target = match.groups()
                else:
                    source, target = match.groups()
                    rel_type = "CONNECTS_TO"
                    
                connections.append(Connection(
                    id=f"conn_{len(connections)}",
                    source=source,
                    target=target,
                    label=rel_type
                ))
        
        return DiagramStructure(
            title="System Architecture",
            components=components or [DiagramComponent(
                id="default",
                type="server",
                label="System"
            )],
            connections=connections
        )
    
    def _calculate_confidence(self, diagram: DiagramStructure, ai_response: str) -> Dict[str, float]:
        """Calculate confidence scores for extracted elements"""
        confidence = {}
        
        # Check how well components match the original text
        for component in diagram.components:
            if component.label.lower() in ai_response.lower():
                confidence[f"component_{component.id}"] = 0.9
            elif component.id.lower() in ai_response.lower():
                confidence[f"component_{component.id}"] = 0.8
            else:
                confidence[f"component_{component.id}"] = 0.6
        
        # Check connections
        for connection in diagram.connections:
            if connection.source in ai_response and connection.target in ai_response:
                confidence[f"connection_{connection.id}"] = 0.85
            else:
                confidence[f"connection_{connection.id}"] = 0.7
        
        return confidence
    
    def _get_source_attributions(self, diagram: DiagramStructure, ai_response: str) -> Dict[str, str]:
        """Get source text snippets for each extracted element"""
        attributions = {}
        
        # Find source text for components
        for component in diagram.components:
            # Look for mentions of the component
            pattern = rf'(?i).*{re.escape(component.label)}.*'
            match = re.search(pattern, ai_response)
            if match:
                # Get surrounding context
                start = max(0, match.start() - 50)
                end = min(len(ai_response), match.end() + 50)
                attributions[f"component_{component.id}"] = ai_response[start:end].strip()
        
        # Find source text for connections
        for connection in diagram.connections:
            # Look for connection mentions
            pattern = rf'(?i).*{re.escape(connection.source)}.*{re.escape(connection.target)}.*'
            match = re.search(pattern, ai_response)
            if match:
                start = max(0, match.start() - 30)
                end = min(len(ai_response), match.end() + 30)
                attributions[f"connection_{connection.id}"] = ai_response[start:end].strip()
        
        return attributions