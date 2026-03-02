"""
AI Provider Integration for LangExtract
Reuses the same provider configuration as SimplifiedThreatAnalyzer
"""

import os
import json
import logging
from typing import Any, Optional, Dict
from pydantic import BaseModel, Field

import openai
import anthropic
import google.generativeai as genai

logger = logging.getLogger(__name__)

class AIProviderConfig(BaseModel):
    """AI Provider configuration matching SimplifiedThreatAnalyzer format"""
    provider: str = Field(..., description="AI provider name")
    model: str = Field(..., description="Model name")
    apiKey: Optional[str] = Field(None, description="API key")
    baseURL: Optional[str] = Field(None, description="Base URL for API")
    temperature: float = Field(0.7, description="Temperature setting")
    maxTokens: int = Field(4000, description="Max tokens for response")

class AIClient:
    """Base AI client interface for LangExtract"""
    
    def __init__(self, config: AIProviderConfig):
        self.config = config
        
    async def generate(self, prompt: str, **kwargs) -> str:
        """Generate response from AI model"""
        raise NotImplementedError("Subclass must implement generate method")

class OpenAIClient(AIClient):
    """OpenAI client implementation"""
    
    def __init__(self, config: AIProviderConfig):
        super().__init__(config)
        self.client = openai.AsyncOpenAI(
            api_key=config.apiKey,
            base_url=config.baseURL
        )
    
    async def generate(self, prompt: str, **kwargs) -> str:
        try:
            response = await self.client.chat.completions.create(
                model=self.config.model,
                messages=[{"role": "user", "content": prompt}],
                temperature=self.config.temperature,
                max_tokens=self.config.maxTokens,
                **kwargs
            )
            return response.choices[0].message.content
        except Exception as e:
            logger.error(f"OpenAI API error: {e}")
            raise

class AnthropicClient(AIClient):
    """Anthropic Claude client implementation"""
    
    def __init__(self, config: AIProviderConfig):
        super().__init__(config)
        self.client = anthropic.AsyncAnthropic(
            api_key=config.apiKey,
            base_url=config.baseURL
        )
    
    async def generate(self, prompt: str, **kwargs) -> str:
        try:
            response = await self.client.messages.create(
                model=self.config.model,
                messages=[{"role": "user", "content": prompt}],
                temperature=self.config.temperature,
                max_tokens=self.config.maxTokens,
                **kwargs
            )
            return response.content[0].text
        except Exception as e:
            logger.error(f"Anthropic API error: {e}")
            raise

class GoogleAIClient(AIClient):
    """Google Gemini client implementation"""
    
    def __init__(self, config: AIProviderConfig):
        super().__init__(config)
        genai.configure(api_key=config.apiKey)
        self.model = genai.GenerativeModel(config.model)
    
    async def generate(self, prompt: str, **kwargs) -> str:
        try:
            response = await self.model.generate_content_async(
                prompt,
                generation_config=genai.GenerationConfig(
                    temperature=self.config.temperature,
                    max_output_tokens=self.config.maxTokens
                )
            )
            return response.text
        except Exception as e:
            logger.error(f"Google AI API error: {e}")
            raise

class OllamaClient(AIClient):
    """Ollama client implementation for local models"""
    
    def __init__(self, config: AIProviderConfig):
        super().__init__(config)
        # Use OpenAI-compatible interface for Ollama
        self.client = openai.AsyncOpenAI(
            api_key="ollama",  # Ollama doesn't need API key
            base_url=config.baseURL or "http://localhost:11434/v1"
        )
    
    async def generate(self, prompt: str, **kwargs) -> str:
        try:
            response = await self.client.chat.completions.create(
                model=self.config.model,
                messages=[{"role": "user", "content": prompt}],
                temperature=self.config.temperature,
                max_tokens=self.config.maxTokens,
                **kwargs
            )
            return response.choices[0].message.content
        except Exception as e:
            logger.error(f"Ollama API error: {e}")
            raise

def get_ai_client(config: AIProviderConfig) -> AIClient:
    """Factory function to get appropriate AI client based on provider"""
    
    provider_map = {
        "openai": OpenAIClient,
        "anthropic": AnthropicClient,
        "google": GoogleAIClient,
        "ollama": OllamaClient,
    }
    
    provider_lower = config.provider.lower()
    
    # Check for custom/local endpoints
    if config.baseURL and "localhost" in config.baseURL:
        # Assume OpenAI-compatible for local endpoints
        return OllamaClient(config)
    
    client_class = provider_map.get(provider_lower)
    if not client_class:
        # Default to OpenAI-compatible client
        logger.warning(f"Unknown provider {config.provider}, using OpenAI-compatible client")
        return OpenAIClient(config)
    
    return client_class(config)