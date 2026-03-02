# Testing LangExtract Diagram Generation

## Overview

This guide provides instructions for testing the new LangExtract integration for AI-powered diagram parsing in ContextCypher.

## Prerequisites

1. **Python Environment**
   - Python 3.8 or higher
   - Virtual environment recommended

2. **LangExtract Service**
   ```bash
   cd services/langextract
   pip install -r requirements.txt
   python main.py
   ```
   The service should start on port 8001.

3. **Backend Server**
   ```bash
   cd server
   npm run dev
   ```
   The server should start on port 3002.

4. **Frontend**
   ```bash
   npm start
   ```
   The frontend should start on port 3000.

## Enabling LangExtract

1. Open the application in your browser (http://localhost:3000)
2. Click the Settings icon (gear icon)
3. Navigate to the "AI Provider" tab
4. Scroll down to "Experimental Features"
5. Toggle "Enable LangExtract for Diagram Generation"
6. Refresh the page for changes to take effect

## Testing Scenarios

### 1. Basic Architecture Test

**Prompt:**
```
Create a simple web application architecture with:
- A React frontend
- Node.js backend API
- PostgreSQL database
- Redis cache
- All components should be in appropriate security zones
```

**Expected Result:**
- 4 components created with correct types
- Components placed in appropriate zones (DMZ for frontend, Internal for backend/cache, Trusted for database)
- Connections between components with proper protocols

### 2. Complex Microservices Test

**Prompt:**
```
Design a microservices e-commerce platform with:
- API Gateway in DMZ
- User Service, Product Service, Order Service in Internal zone
- Each service has its own MongoDB database in Trusted zone
- RabbitMQ message broker for service communication
- Redis cache for session management
- Include proper authentication flows
```

**Expected Result:**
- 8+ components with proper service types
- Correct zone placement
- Message queue connections between services
- Database connections from services to their respective databases

### 3. Cloud Architecture Test

**Prompt:**
```
Create an AWS cloud architecture with:
- CloudFront CDN
- Application Load Balancer
- Auto-scaling EC2 instances running Docker containers
- RDS Multi-AZ database
- S3 bucket for static assets
- ElastiCache for caching
- VPC with public and private subnets
```

**Expected Result:**
- Cloud-specific component types recognized
- Proper AWS service representations
- Network segmentation visible
- High availability patterns shown

### 4. Malformed Response Test

Test LangExtract's ability to handle poorly formatted AI responses.

**Prompt:**
```
Create a system with web server, app server, and database
```

**Expected Result:**
- LangExtract should still extract the three components
- Basic connections should be inferred
- Fallback to sensible defaults for missing information

## Verification Steps

### 1. Check Console Logs

Open browser DevTools and look for:
```
[DiagramGeneration] Attempting LangExtract parsing
[DiagramGeneration] LangExtract successfully parsed diagram
[DiagramGeneration] Extracted X nodes and Y edges
```

### 2. Compare with Regex Parsing

1. Disable LangExtract in settings
2. Generate the same diagram
3. Enable LangExtract
4. Generate again
5. Compare:
   - Component accuracy
   - Connection correctness
   - Zone assignments
   - Overall structure

### 3. Performance Testing

Monitor parsing time:
- LangExtract: Should complete in 1-3 seconds
- Fallback regex: Should be faster but less accurate

### 4. Error Handling

Test with LangExtract service stopped:
1. Stop the Python service
2. Try generating a diagram
3. Should see: `[DiagramGeneration] LangExtract parsing failed, falling back to regex`
4. Diagram should still generate using regex parsing

## Troubleshooting

### LangExtract Not Working

1. **Check service is running:**
   ```bash
   curl http://localhost:8001/health
   ```

2. **Check browser console for errors:**
   - CORS issues
   - Network errors
   - 404 or 500 errors

3. **Verify setting is enabled:**
   ```javascript
   localStorage.getItem('langExtractDiagramEnabled')
   // Should return "true"
   ```

### Slow Performance

1. **Check AI provider configuration:**
   - LangExtract uses the same AI provider as threat analysis
   - Local LLMs may be slower

2. **Monitor service logs:**
   ```bash
   # In services/langextract directory
   tail -f logs/langextract.log
   ```

### Incorrect Parsing

1. **Enable verbose logging:**
   - Check extraction confidence scores in response
   - Look for source attribution mismatches

2. **Test with different AI providers:**
   - Some providers may format responses differently
   - LangExtract should handle all formats

## Expected Improvements

With LangExtract enabled, you should see:

1. **Better Format Handling**
   - Handles Cypher, JSON, and natural language responses
   - No more "Failed to parse AI response" errors

2. **More Accurate Extraction**
   - Components with proper metadata
   - Connections with correct protocols
   - Better zone detection

3. **Enhanced Error Recovery**
   - Partial extraction from malformed responses
   - Graceful degradation

4. **Source Attribution**
   - Can trace each component back to AI response text
   - Confidence scores for extracted elements

## Reporting Issues

When reporting issues, include:
1. The prompt used
2. Console logs (with [DiagramGeneration] and [LangExtract] prefixes)
3. Whether fallback to regex occurred
4. Screenshots of generated diagram
5. LangExtract service logs if available