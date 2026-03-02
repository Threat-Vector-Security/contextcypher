// Quick script to check Ollama model availability
const axios = require('axios');

async function checkOllamaModels() {
    const baseUrl = 'http://localhost:11434';
    
    try {
        // List available models
        console.log('Checking Ollama models at', baseUrl);
        const response = await axios.get(`${baseUrl}/api/tags`);
        
        console.log('\nAvailable models:');
        response.data.models.forEach(model => {
            console.log(`- ${model.name} (${model.size})`);
        });
        
        // Test llama3.1:8b
        console.log('\nTesting llama3.1:8b...');
        await axios.post(`${baseUrl}/api/generate`, {
            model: 'llama3.1:8b',
            prompt: 'Test',
            stream: false
        });
        console.log('✅ llama3.1:8b is working');
        
        // Test llama3.2:latest (likely missing)
        console.log('\nTesting llama3.2:latest...');
        try {
            await axios.post(`${baseUrl}/api/generate`, {
                model: 'llama3.2:latest',
                prompt: 'Test',
                stream: false
            });
            console.log('✅ llama3.2:latest is working');
        } catch (err) {
            console.log('❌ llama3.2:latest not found:', err.response?.status || err.message);
        }
        
    } catch (error) {
        console.error('Error checking Ollama:', error.message);
    }
}

checkOllamaModels();