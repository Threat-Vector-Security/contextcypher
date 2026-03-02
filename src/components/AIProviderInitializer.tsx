import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { updateAIProvider } from '../services/settingsApi';
import { isVercelDeployment } from '../utils/vercelDetection';

interface AIProviderInitializerProps {
  children: React.ReactNode;
}

export const AIProviderInitializer: React.FC<AIProviderInitializerProps> = ({ children }) => {
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    const initializeProvider = async () => {
      try {
        // Skip initialization in Vercel deployments
        if (isVercelDeployment()) {
          console.log('AIProviderInitializer - Running on Vercel, skipping auto-initialization');
          setIsInitializing(false);
          return;
        }

        console.log('AIProviderInitializer - Checking current provider status...');
        
        // Check current provider status
        const response = await api.get('/api/settings/current-provider');
        const { provider, isInitialized, isLocal } = response.data;

        console.log('Current provider status:', {
          provider,
          isInitialized,
          isLocal
        });

        // If no provider is set and we're in local mode, initialize Ollama
        if (!provider && isLocal) {
          console.log('No provider set in local mode, initializing Ollama...');
          
          try {
            // Test if Ollama is running first
            const testResponse = await fetch('http://localhost:11434/api/tags', {
              method: 'GET'
            });

            if (testResponse.ok) {
              console.log('Ollama is running, initializing as default provider...');
              
              // Initialize Ollama as the provider
              const result = await updateAIProvider({
                provider: 'ollama' as any,
                apiKey: 'not-required',
                baseUrl: 'http://localhost:11434',
                model: 'llama3.1'
              });
              
              if (result.success) {
                console.log('Ollama initialized successfully as default provider');
              } else {
                console.warn('Failed to initialize Ollama:', result.error);
              }
            } else {
              console.log('Ollama is not running on localhost:11434');
            }
          } catch (error: any) {
            console.log('Ollama is not available:', error.message || error);
          }
        } else if (provider) {
          console.log(`Using existing provider: ${provider}`);
        }
      } catch (error) {
        console.error('Error in AIProviderInitializer:', error);
      } finally {
        setIsInitializing(false);
      }
    };

    initializeProvider();
  }, []);

  // Show loading state while initializing
  if (isInitializing) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        backgroundColor: '#f5f5f5'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ marginBottom: '10px' }}>Initializing AI providers...</div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
