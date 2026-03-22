//index.js
// Core dependencies
// Only load dotenv in development or if not skipped
if (process.env.SKIP_DOTENV !== 'true' && process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

// Check for force production flag first
if (process.env.FORCE_PRODUCTION === 'true') {
  process.env.NODE_ENV = 'production';
  console.log('FORCE_PRODUCTION is set - ensuring production mode');
  // Double-check critical production settings
  process.env.BIND_ALL_INTERFACES = 'false';
  process.env.DISABLE_REMOTE_INTEL = 'true';
}

// Force development mode if not explicitly set to production
if (!process.env.NODE_ENV || process.env.NODE_ENV === '') {
  process.env.NODE_ENV = 'development';
}

// Log startup environment
console.log('=== SERVER STARTUP ===');
console.log(`NODE_ENV: ${process.env.NODE_ENV}`);
console.log(`FORCE_PRODUCTION: ${process.env.FORCE_PRODUCTION || 'not set'}`);
console.log(`Script: ${process.argv[1]}`);
console.log(`Working Directory: ${process.cwd()}`);
console.log(`Process ID: ${process.pid}`);
console.log(`BIND_ALL_INTERFACES: ${process.env.BIND_ALL_INTERFACES || 'not set'}`);
console.log('===================')

// Check if we should skip internal node (for development mode with external servers)
if (process.env.SKIP_INTERNAL_NODE === '1') {
  console.log('[SKIP] External development servers are running - skipping internal server launch.');
  console.log('[SKIP] Frontend should be on http://localhost:3000');
  console.log('[SKIP] Backend should be on http://localhost:3001');
  process.exit(0);
}

// Removed Swarms bundle check - no longer using Python Swarms system

const express = require('express');
const path = require('path');
const crypto = require('crypto');
const { safeOllamaUrl, validateOllamaBaseUrl } = require('./utils/ollamaUrl');


function sanitizeDiagramId(id) {
  if (!id || typeof id !== 'string') return null;
  const trimmed = id.trim();
  if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) return null;
  return trimmed;
}

function safePath(baseDir, filename) {
  const resolved = path.resolve(baseDir, filename);
  if (!resolved.startsWith(path.resolve(baseDir) + path.sep)) {
    throw new Error('Path traversal detected');
  }
  return resolved;
}

const fs = require('fs');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { spawn } = require('child_process');

// Security configuration
const security = require('./utils/security');

// AI and formatting dependencies
const formatters = require('./utils/formatters');
const modelConstants = require('./utils/modelConstants');
const AIProviderManager = require('./aiProviders');
const { getEndpointProfile, isLocalProvider, applyChatContextReinforcement, getDiagramGenerationConfig } = require('./config/modelProfiles');
const { getProcessor } = require('./utils/modelResponseProcessors');
// Use logger wrapper that handles environment detection
const logger = require('./utils/logger-wrapper');
const { writePortFile, removePortFile, findAvailablePort } = require('./port-manager');
const { getValidNodeTypesString, getValidNodeTypes } = require('./utils/nodeTypes');
const { getValidSecurityZonesString, getValidSecurityZones } = require('./utils/securityZones');

// Check if running on Vercel (global variable)
const isVercel = process.env.IS_VERCEL || process.env.VERCEL;

// Import extracted modules
const riskMatrix = require('./utils/riskMatrix');
const { safeWrite } = require('./utils/streamUtils');
const { loadSavedProviderConfig, saveProviderConfig, PROVIDER_CONFIG_PATH } = require('./config/providerConfig');
const { DIAGRAMS_DIR, THREAT_INTEL_DIR, DEBUG_MODE, TIMEOUT_DURATION } = require('./config/paths');
const { convertJsonToCypher } = require('./utils/cypherConverter');

const cloudDiscoveryEnabled = process.env.ENABLE_CLOUD_DISCOVERY === 'true';

// -----------------------------------------------------------------------------
// Global Exception Handlers
// -----------------------------------------------------------------------------
process.on('uncaughtException', (err, origin) => {
  logger.error(`💥 UNCAUGHT EXCEPTION: ${err.stack || err}`);
  logger.error(`💥 Origin: ${origin}`);
  // In a real production environment, you might want to gracefully shutdown.
  // For this web app, logging the error is often sufficient as the server
  // can be restarted by the user or process manager.
  // process.exit(1); 
});

process.on('unhandledRejection', (reason, promise) => {
  logger.warn(`✋ UNHANDLED REJECTION: ${reason}`);
  // In a real production environment, you might want to gracefully shutdown.
});

// Extracted to utils/streamUtils.js and utils/riskMatrix.js
// Now imported at the top of the file

  logger.info('ContextCypher Server - Desktop Version starting...');

// Paths now imported from config/paths.js
// Ensure directories exist (skip on Vercel - read-only filesystem)
if (!process.env.IS_VERCEL && !process.env.VERCEL) {
  if (!fs.existsSync(DIAGRAMS_DIR)) {
    fs.mkdirSync(DIAGRAMS_DIR, { recursive: true });
  }
  if (!fs.existsSync(THREAT_INTEL_DIR)) {
    fs.mkdirSync(THREAT_INTEL_DIR, { recursive: true });
  }
}

// Service initialization
let aiManager = null;

// Initialization guard to prevent multiple concurrent initializations
let initializationPromise = null;
let isInitializing = false;

async function initializeServices() {
  // Prevent multiple concurrent initializations
  if (initializationPromise) {
    // Already initializing or initialized - return the existing promise
    return await initializationPromise;
  }
  
  if (aiManager && aiManager.getCurrentProvider()) {
    logger.info('Services are already initialized, skipping...');
    return;
  }
  
  // Create and store the initialization promise
  initializationPromise = (async () => {
    try {
      logger.info('Initializing services...');
      
      // Initialize AI Provider Manager first
      aiManager = new AIProviderManager(formatters.SECURITY_ANALYSIS_PROMPT);
      
      // Check if running on Vercel (use global isVercel variable)
      
      if (isVercel) {
        logger.info('Running on Vercel - skipping local Ollama and using cloud providers');
      } else {
        // Normal startup - attempt to load previously saved provider configuration
        const savedCfg = loadSavedProviderConfig();
        if (savedCfg && savedCfg.provider) {
          // Only restore local provider on startup (doesn't need API keys)
          // Public providers need API keys which aren't persisted
          if (savedCfg.provider === 'local') {
            try {
              logger.info('Found saved local provider config, restoring provider:', savedCfg.provider);
              await aiManager.initializeProvider(savedCfg.provider, savedCfg.config || {});
              logger.info('Restored provider from saved config:', aiManager.getCurrentProvider());
            } catch (err) {
              logger.warn('Failed to restore saved provider config, falling back to defaults:', err.message);
            }
          } else {
            logger.info(`Found saved config for ${savedCfg.provider} but skipping restoration (requires API key)`);
          }
        }
        
        // If still no provider, fall back to default local initialisation
        if (!aiManager.getCurrentProvider()) {
          logger.info('ContextCypher - Offline-first approach: Trying local LLM first');
          await aiManager.initializeDefaultProvider();
        }
      }
      
      // Check if we have a provider initialized
      if (!isVercel && aiManager.getCurrentProvider() === 'local') {
        logger.info('Local LLM successfully initialized and set as current provider');
      } else if (!aiManager.getCurrentProvider()) {
        logger.warn(isVercel ? 'On Vercel, need cloud provider' : 'Local LLM initialization failed, no provider set');
        
        // Try environment variables for cloud providers (always on Vercel, or in development)
        if (isVercel || process.env.NODE_ENV === 'development') {
          logger.info('Local LLM not available, checking for environment variables as fallback');
          
          let providerInitialized = false;
          
          // Try to initialize OpenAI if API key is available (fallback only)
          if (process.env.OPENAI_API_KEY) {
            try {
              // Skip test on Vercel to prevent cold start timeouts
              await aiManager.initializeProvider('openai', { 
                apiKey: process.env.OPENAI_API_KEY,
                organizationId: process.env.OPENAI_ORG_ID || undefined
              }, true);
              logger.info('Fallback: Successfully initialized OpenAI provider with environment variables');
              providerInitialized = true;
            } catch (error) {
              logger.error('Failed to initialize OpenAI provider with environment variables:', error.message);
            }
          }
          
          // Try Anthropic if OpenAI is not available
          if (!providerInitialized && process.env.ANTHROPIC_API_KEY) {
            try {
              // Skip test on Vercel to prevent cold start timeouts
              await aiManager.initializeProvider('anthropic', { 
                apiKey: process.env.ANTHROPIC_API_KEY 
              }, true);
              logger.info('Fallback: Successfully initialized Anthropic provider with environment variables');
              providerInitialized = true;
            } catch (error) {
              logger.error('Failed to initialize Anthropic provider with environment variables:', error.message);
            }
          }
          
          // Try Gemini if others are not available
          if (!providerInitialized && (process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY)) {
            try {
              // Skip test on Vercel to prevent cold start timeouts
              await aiManager.initializeProvider('gemini', { 
                apiKey: process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY 
              }, true);
              logger.info('Fallback: Successfully initialized Gemini provider with environment variables');
              providerInitialized = true;
            } catch (error) {
              logger.error('Failed to initialize Gemini provider with environment variables:', error.message);
            }
          }
          
          if (!providerInitialized) {
            if (isVercel) {
              logger.warn('No cloud providers configured via environment variables on Vercel. User must configure API key through settings.');
              logger.info('Suggested providers for Vercel: OpenAI, Anthropic Claude, or Google Gemini');
            } else {
              logger.warn('No providers available. User will need to configure through settings.');
            }
          }
        } else {
          logger.info('In production mode, user will need to configure through settings if local LLM is not available.');
        }
      }
      
      // Threat intelligence services removed - using LangExtract now
      logger.info('Legacy threat intelligence services removed');
      
      
      logger.info('Services initialized:', {
        aiManagerReady: true,
        threatIntelReady: false,
        currentProvider: aiManager.getCurrentProvider()
      });

    } catch (error) {
      logger.error('Service initialization error:', error);
      throw error;
    } finally {
      // Reset initialization flag
    }
  })();
  
  return await initializationPromise;
}


// Update initialization
initializeServices().catch(error => {
    logger.error('Failed to initialize services:', error);
    if (process.env.NODE_ENV === 'production' && !isVercel) {
        process.exit(1);
    }
});

// Legacy threat intelligence refresh removed - now using LangExtract on-demand

// Timeout configuration now imported from config/paths.js

// Initialize express app
const app = express();

// Enable trust proxy for Vercel deployment
if (isVercel) {
  // Trust the first proxy (Vercel's edge network)
  // This is more secure than 'true' which trusts all proxies
  app.set('trust proxy', 1);
  logger.info('Trust proxy enabled for Vercel deployment (trusting first proxy)');
}

// Track active connections for debugging
let activeConnections = 0;
const connectionTracker = new Map();
let browserOpenedForSession = false;

function openBrowser(url) {
  const platform = process.platform;
  let command;
  let args = [];

  if (platform === 'win32') {
    command = 'cmd';
    args = ['/c', 'start', '', url];
  } else if (platform === 'darwin') {
    command = 'open';
    args = [url];
  } else {
    command = 'xdg-open';
    args = [url];
  }

  const child = spawn(command, args, {
    detached: true,
    stdio: 'ignore'
  });
  child.unref();
}

// Configure CORS with environment-specific settings
const corsOptions = security.getCorsOptions();
app.use(cors(corsOptions));

// Request logging middleware - MUST come early to catch all requests
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  const requestId = crypto.randomBytes(4).toString('hex');
  req.requestId = requestId;
  
  logger.info(`[${timestamp}] [${requestId}] Incoming request:`, {
    method: req.method,
    path: req.path,
    query: req.query,
    headers: {
      'content-type': req.headers['content-type'],
      'x-app-secret': req.headers['x-app-secret'] ? '[PRESENT]' : '[MISSING]',
      'x-offline-mode': req.headers['x-offline-mode'],
      'origin': req.headers.origin,
      'referer': req.headers.referer,
      'user-agent': req.headers['user-agent']
    },
    environment: process.env.NODE_ENV || 'development'
  });
  
  // Log response when it's finished
  const originalSend = res.send;
  res.send = function(data) {
    logger.info(`[${timestamp}] [${requestId}] Response:`, {
      statusCode: res.statusCode,
      headers: res.getHeaders()
    });
    return originalSend.call(this, data);
  };
  
  next();
});

// Apply JSON parser early to ensure body is available for logging
app.use(express.json({
  limit: '50mb'
}));

// Some serverless adapters mount this app under "/api", so Express may receive
// "/settings/..." instead of "/api/settings/...". Normalize known API prefixes.
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return next();
  }

  const apiLikePrefixes = [
    '/settings/',
    '/chat',
    '/analyze',
    '/providers/',
    '/threat-analysis',
    '/diagram/',
    '/generate-diagram',
    '/cancel-request',
    '/messages/compact',
    '/server/',
    '/grc/',
    '/langextract/',
    '/threat-intel/',
    '/mcp/'
  ];

  if (apiLikePrefixes.some((prefix) => req.path.startsWith(prefix))) {
    req.url = `/api${req.url}`;
  }

  return next();
});

// Serve static files from the React build
// Support multiple possible locations for different deployment scenarios
const possibleStaticPaths = [
  path.join(__dirname, '..', 'dist'),        // NPM package structure
  path.join(__dirname, '..', 'frontend'),    // MSI/enterprise structure
  path.join(__dirname, '..', 'build'),       // Development structure
  process.env.FRONTEND_PATH                   // Custom path via environment variable
].filter(Boolean);

let staticPath = null;
for (const possiblePath of possibleStaticPaths) {
  if (fs.existsSync(possiblePath)) {
    staticPath = possiblePath;
    break;
  }
}

if (staticPath) {
  logger.info('Serving static files from:', staticPath);
  app.use(express.static(staticPath, {
    maxAge: process.env.NODE_ENV === 'production' ? '1d' : 0,
    etag: true
  }));
} else {
  logger.warn('No static files directory found. Checked:', possibleStaticPaths);
}

// Apply security headers
app.use(security.securityHeaders);

// Apply rate limiting (excluding health checks)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  skip: (req) => {
    // Skip rate limiting for health checks
    return req.path === '/api/health';
  },
  // For Vercel deployment, use custom key generator that handles proxy headers
  keyGenerator: (req) => {
    if (isVercel) {
      // Vercel provides the real IP in x-forwarded-for header
      const forwarded = req.headers['x-forwarded-for'];
      if (forwarded) {
        // Take the first IP in the chain (the actual client IP)
        return forwarded.split(',')[0].trim();
      }
    }
    // Fallback to default behavior
    return req.ip;
  }
});
app.use('/api/', limiter);

// Apply app secret validation for non-public endpoints
app.use('/api/', (req, res, next) => {
  const timestamp = new Date().toISOString();
  const requestId = req.requestId || 'unknown';
  
  // Skip validation for health check and other public endpoints
  const publicEndpoints = ['/api/health', '/api/providers/list'];
  if (publicEndpoints.includes(req.path)) {
    logger.debug(`[${timestamp}] [${requestId}] Skipping app secret validation for public endpoint: ${req.path}`);
    return next();
  }
  
  // In development, skip validation unless explicitly enabled
  const config = security.getServerConfig();
  if (!config.requireAppSecret && process.env.NODE_ENV !== 'production') {
    logger.debug(`[${timestamp}] [${requestId}] App secret validation disabled in development for: ${req.path}`);
    return next();
  }
  
  logger.debug(`[${timestamp}] [${requestId}] Validating app secret for: ${req.path}`);
  return security.validateAppSecret(req, res, next);
});

// Single timeout middleware with special handling for diagram generation
app.use((req, res, next) => {
  // Use longer timeout for diagram generation endpoints
  if (req.path === '/api/generate-diagram') {
    const diagramTimeout = 720000; // 12 minutes for diagram generation
    req.setTimeout(diagramTimeout);
    res.setTimeout(diagramTimeout);
  } else {
    req.setTimeout(TIMEOUT_DURATION);
    res.setTimeout(TIMEOUT_DURATION);
  }
  next();
});

// === API Routes ===
// Import threat intelligence routes
const threatIntelRoutes = require('./routes/threatIntelRoutes');
app.use('/api/threat-intel', threatIntelRoutes);

// Import LangExtract routes
const langExtractRoutes = require('./routes/langExtractRoutes');
app.use('/api/langextract', langExtractRoutes);

// Import GRC routes
const grcRoutes = require('./routes/grcRoutes');
app.use('/api/grc', grcRoutes);

// Health check endpoint for Tauri app
app.get('/api/health', (req, res) => {
  const timestamp = new Date().toISOString();
  const clientIp = req.ip || req.connection.remoteAddress || 'unknown';
  const userAgent = req.headers['user-agent'] || 'unknown';
  const actualPort = parseInt(process.env.ACTUAL_PORT || process.env.PORT || '3001', 10);
  
  logger.info(`[HEALTH CHECK] ${timestamp} - Request from ${clientIp}`);
  logger.info(`[HEALTH CHECK] User-Agent: ${userAgent}`);
  logger.info(`[HEALTH CHECK] Server running on port: ${actualPort}`);
  logger.info(`[HEALTH CHECK] Process uptime: ${process.uptime()}s`);
  const mem = process.memoryUsage();
  logger.info(`[HEALTH CHECK] Memory usage: ${(mem.rss/1048576).toFixed(1)} MB RSS / ${(mem.heapUsed/1048576).toFixed(1)} MB Heap`);
  
  const response = { 
    status: 'ok', 
    timestamp: timestamp,
    port: actualPort,
    uptime: process.uptime(),
    pid: process.pid
  };
  
  logger.info(`[HEALTH CHECK] Response:`, response);
  res.json(response);
});

// Server restart endpoint (only for local/development use)
app.post('/api/server/restart', async (req, res) => {
  // Security check - only allow in development or from localhost
  const isLocalhost = req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1';
  if (!isLocalhost && process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Restart not allowed' });
  }
  
  logger.info('Server restart requested via API');
  
  // Send response before restarting
  res.json({ message: 'Server restart initiated' });
  
  // Restart after a short delay
  setTimeout(async () => {
    await restartServer();
  }, 500);
});

// Single consolidated error handler
app.use((err, req, res, next) => {
    const timestamp = new Date().toISOString();
    const requestId = req.requestId || 'unknown';
    
    // Enhanced error logging
    logger.error(`[${timestamp}] [${requestId}] Error occurred:`, {
        type: err.name,
        message: err.message,
        code: err.code,
        statusCode: err.statusCode,
        path: req.path,
        method: req.method,
        headers: {
            'x-app-secret': req.headers['x-app-secret'] ? '[PRESENT]' : '[MISSING]',
            'origin': req.headers.origin,
            'content-type': req.headers['content-type']
        },
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });

    // Handle CORS errors
    if (err.message && err.message.includes('CORS')) {
        logger.error(`[${timestamp}] [${requestId}] CORS error detected`);
        return res.status(403).json({
            error: 'CORS error',
            message: 'Cross-origin request blocked',
            details: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }

    if (err.name === 'TimeoutError') {
        return res.status(408).json({
            error: 'Request timeout',
            message: 'The request took too long to process. Try reducing the analysis scope.'
        });
    }

    if (err.type === 'entity.too.large') {
        return res.status(413).json({
            error: 'Payload too large',
            message: 'Request body exceeds limit'
        });
    }

    res.status(err.status || 500).json({
        error: err.message || 'Internal server error',
        details: process.env.NODE_ENV === 'development' ? err.stack : undefined,
        timestamp: new Date().toISOString()
    });
});


// Simple request logging middleware (no authentication)
app.use((req, res, next) => {
  // Log the incoming request for debugging
  logger.info('Incoming request:', {
    path: req.path,
    method: req.method,
    environment: process.env.NODE_ENV || 'development'
  });
  
  next();
});

// Duplicate health endpoint removed - using the one defined earlier


// Helper function to get API keys from environment variables only
const getAPIKey = (provider, req) => {
  let envKey = null;
  switch (provider) {
    case 'openai':
      envKey = process.env.OPENAI_API_KEY;
      break;
    case 'anthropic':
      envKey = process.env.ANTHROPIC_API_KEY;
      break;
    case 'gemini':
      envKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
      break;
    default:
      // No environment key for other providers
      break;
  }
  
  if (envKey) {
    logger.info(`Using ${provider} API key from environment variables`);
    return envKey;
  }
  
  logger.warn(`No API key found for provider: ${provider}`);
  return null;
};

const SUPPORTED_AI_PROVIDERS = new Set(['openai', 'anthropic', 'gemini', 'local']);

const getRequestedProvider = (providerFromBody, req) => {
  return providerFromBody || req.body?.providerConfig?.provider || null;
};

const getProviderInitConfigFromRequest = (provider, req) => {
  const requestConfig = req.body?.providerConfig || {};

  const config = {
    organizationId: requestConfig.organizationId || req.body?.organizationId || null,
    projectId: requestConfig.projectId || req.body?.projectId || null,
    baseUrl: requestConfig.baseUrl || req.body?.baseUrl,
    model: requestConfig.model || req.body?.model,
    temperature: requestConfig.temperature ?? req.body?.temperature,
    maxTokens: requestConfig.maxTokens ?? req.body?.maxTokens
  };

  if (provider === 'local') {
    // Local defaults are safe for desktop mode; callers can override in payload.
    config.baseUrl = config.baseUrl || 'http://127.0.0.1:11434';
    config.model = config.model || 'llama3.1:8b';
    config.temperature = config.temperature ?? 0.2;
    config.maxTokens = config.maxTokens ?? 4096;
  } else {
    config.apiKey = requestConfig.apiKey || req.body?.apiKey || getAPIKey(provider, req);
  }

  return config;
};

async function ensureProviderInitializedForRequest(req, preferredProvider) {
  await initializeServices();

  const requestedProvider = getRequestedProvider(preferredProvider, req) || aiManager.getCurrentProvider();

  if (!requestedProvider) {
    return {
      ok: false,
      status: 400,
      error: 'No Provider Configured',
      message: 'No AI provider is configured. Please configure an AI provider in Settings first.',
      details: 'Provide an API key in settings or configure environment variables on Vercel.'
    };
  }

  if (!SUPPORTED_AI_PROVIDERS.has(requestedProvider)) {
    return {
      ok: false,
      status: 400,
      error: 'Invalid Provider',
      message: `Unsupported provider: ${requestedProvider}`
    };
  }

  if (aiManager.isProviderInitialized(requestedProvider)) {
    if (aiManager.getCurrentProvider() !== requestedProvider) {
      try {
        await aiManager.switchProvider(requestedProvider);
      } catch (error) {
        return {
          ok: false,
          status: 400,
          error: 'Provider Error',
          message: `Could not switch to provider ${requestedProvider}: ${error.message}`
        };
      }
    }

    return { ok: true, provider: requestedProvider, initializedNow: false };
  }

  const initConfig = getProviderInitConfigFromRequest(requestedProvider, req);

  if (requestedProvider === 'local') {
    const baseUrlValidation = validateOllamaBaseUrl(initConfig.baseUrl);
    if (!baseUrlValidation.valid) {
      return {
        ok: false,
        status: 400,
        error: 'Invalid Local LLM URL',
        message: baseUrlValidation.error,
        details: 'Use http://127.0.0.1:11434 or configure OLLAMA_ALLOWED_HOSTS for additional hosts.'
      };
    }
  }

  if (requestedProvider !== 'local' && !initConfig.apiKey) {
    logger.warn(`Provider ${requestedProvider} requested but no API key is available`);
    return {
      ok: false,
      status: 400,
      error: 'Provider Not Initialized',
      message: `Provider ${requestedProvider} is not initialized and no API key was provided.`,
      details: 'Set the provider API key in app settings or configure provider environment variables in Vercel.'
    };
  }

  try {
    logger.info('Attempting request-scoped provider initialization:', {
      provider: requestedProvider,
      hasApiKey: !!initConfig.apiKey,
      hasModel: !!initConfig.model,
      hasBaseUrl: !!initConfig.baseUrl,
      hasOrgId: !!initConfig.organizationId,
      hasProjectId: !!initConfig.projectId
    });

    // Skip test for request-scoped initialization to avoid timeouts on Vercel
    await aiManager.initializeProvider(requestedProvider, initConfig, true);

    return { ok: true, provider: requestedProvider, initializedNow: true };
  } catch (error) {
    logger.error(`Request-scoped initialization failed for ${requestedProvider}:`, error);
    return {
      ok: false,
      status: 400,
      error: 'Provider Error',
      message: `Failed to initialize provider ${requestedProvider}: ${error.message}`,
      details: 'Please verify API key, model, and provider settings.'
    };
  }
}

// Analysis endpoint
app.post('/api/analyze', async (req, res) => {
  try {
    // Ensure AI services are ready in serverless cold starts
    const providerStatus = await ensureProviderInitializedForRequest(req);
    if (!providerStatus.ok) {
      return res.status(providerStatus.status).json({
        error: providerStatus.error,
        message: providerStatus.message,
        details: providerStatus.details
      });
    }

    logger.info('\n=== Incoming Analysis Request ===');
    const { diagram, context } = req.body;
    // Extract data from context object if present
    const metadata = context?.metadata || req.body.metadata;
    const customContext = context?.customContext || req.body.customContext;
    const drawings = context?.drawings || req.body.drawings;
    const messageHistory = context?.messageHistory || req.body.messageHistory;
    
    // Extract chat web search settings from metadata
    const enableChatWebSearch = metadata?.enableChatWebSearch || false;
    const chatWebSearchConfig = metadata?.chatWebSearchConfig || null;
    
    // Extract analysis mode from metadata
    const analysisMode = metadata?.analysisMode || 'comprehensive';
    
    logger.info('Analysis request details:', {
      nodeCount: diagram?.nodes?.length,
      edgeCount: diagram?.edges?.length,
      hasCustomContext: !!customContext,
      hasDrawings: !!drawings,
      messageHistoryLength: messageHistory?.length,
      analysisMode,
      timestamp: new Date().toISOString()
    });
    
    // Validate diagram data
    if (!diagram || !diagram.nodes || diagram.nodes.length === 0) {
      return res.status(400).json({ 
        error: 'Invalid diagram data', 
        message: 'Please provide a valid diagram with at least one node.' 
      });
    }
    
    // Create analysis context for the AI provider
    const analysisContext = {
      customContext,
      drawings,
      metadata: {
        ...metadata,
        analysisMode,
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV
      }
    };
    
    logger.info(`Analysis using ${analysisMode} methodology`);
    
    // Threat intelligence temporarily disabled
    logger.info('Threat intelligence service disabled - skipping analysis');
    const threatIntel = null;
    
    // Always use optimized context for all providers
    const useSmartContext = true;
    
    // Format the prompt for the AI provider using optimized context
    const analysisPrompt = formatters.formatPromptForProvider({
      diagram,
      threatIntel,
      context: {
        ...analysisContext,
        previousDiagram: context?.previousDiagram,
        diagramChanges: context?.diagramChanges,
        messageHistory: messageHistory,
        isAnalyzeEndpoint: true // Flag to indicate this is from analyze endpoint
      },
      message: 'Analyze this architecture diagram for security threats and risks.'
    });
    const detailContextUsed = false;
    
    logger.info(`Using analysis mode: ${analysisMode}`);

    // Log the prompt length for debugging
    logger.info(`Formatted prompt length: ${analysisPrompt.length} characters`);
    logger.info(`Using analysis mode: ${analysisMode}`);

    // Generate the response
    logger.info('=== Preparing AI Request ===', {
      messageCount: 2,
      systemPrompt: analysisPrompt.substring(0, 100) + '...',
      diagramData: diagram ? `defined with ${diagram.nodes?.length || 0} nodes` : 'undefined...',
      hasCustomContext: !!customContext,
      hasThreatIntel: !!threatIntel
    });

    try {
      const response = await aiManager.generateAnalysis(analysisPrompt, diagram, {
        enableWebSearch: enableChatWebSearch,
        webSearchConfig: chatWebSearchConfig
      });
      
      // Format the response for the client
      const formattedResponse = formatters.formatAIResponse(
        response,
        aiManager.getCurrentProvider(),
        aiManager.getCurrentModel(),
        { message: 'Analyze this architecture diagram for security threats and risks.' }
      );
      
      // Mark whether smart-context optimisation was used
      formattedResponse.metadata.smartContextUsed = useSmartContext;
      
      // Add threat intel sources to the response metadata
      formattedResponse.metadata.threatIntelSources = {
        mitre: threatIntel?.mitreFindings?.length || 0,
        github: threatIntel?.githubFindings?.length || 0,
        alienVault: threatIntel?.alienVaultFindings?.length || 0,
        nvd: threatIntel?.nvdFindings?.length || 0
      };
      
      // Send the response to the client
      res.json(formattedResponse);
    } catch (error) {
      logger.error('AI Provider Error:', {
        error: error.message,
        type: error.constructor.name
      });
      
      // Check for API key related errors
      if (error.message.includes('API key') || 
          error.message.includes('authentication') || 
          error.message.includes('provider not initialized') ||
          error.message.includes('check your API key')) {
        return res.status(401).json({
          error: 'API Key Error',
          message: `${error.message}. Please check your API key in settings.`
        });
      }
      
      // Re-throw for general error handling
      throw error;
    }
  } catch (error) {
    logger.error('Analysis API Error:', {
      error: error.message,
      type: error.constructor.name,
      stack: error.stack
    });
    
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// === Diagram Conversion Endpoint ===
// Dedicated endpoint for converting imported diagrams to ContextCypher format
app.post('/api/convert-diagram', async (req, res) => {
  try {
    const { content, format, prompt, provider } = req.body;
    
    logger.info('Diagram conversion request received:', { format, provider });
    
    if (!content || !format || !prompt) {
      return res.status(400).json({ 
        success: false, 
        error: 'Content, format, and prompt are required for diagram conversion' 
      });
    }
    
    // Ensure AI manager is initialized
    if (!aiManager) {
      return res.status(503).json({ 
        success: false, 
        error: 'AI service not initialized' 
      });
    }
    
    // Use specified provider or current provider
    if (provider) {
      await aiManager.switchProvider(provider);
    }
    
    const currentProvider = aiManager.getCurrentProvider();
    
    if (!currentProvider) {
      return res.status(503).json({ 
        success: false, 
        error: 'AI provider not configured' 
      });
    }
    
    try {
      // Call AI to convert the diagram
      const messages = [
        {
          role: 'system',
          content: 'You are a diagram conversion expert. Convert diagrams to ContextCypher security-focused format. Always respond with valid JSON only, no additional text.'
        },
        {
          role: 'user',
          content: prompt
        }
      ];
      
      const response = await aiManager.generateResponse(messages, {
        temperature: 0.3,
        maxTokens: 8000
      });
      
      // Extract the content from the response
      const responseContent = response.content || response;
      
      // Try to parse the response as JSON
      let parsedDiagram;
      try {
        // Extract JSON from response (in case AI adds text)
        const jsonMatch = responseContent.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsedDiagram = JSON.parse(jsonMatch[0]);
        } else {
          parsedDiagram = JSON.parse(responseContent);
        }
      } catch (parseError) {
        logger.error('Failed to parse AI response:', responseContent);
        return res.status(500).json({
          success: false,
          error: 'AI response was not valid JSON',
          details: responseContent.substring(0, 200) + '...'
        });
      }
      
      return res.status(200).json({
        success: true,
        diagram: parsedDiagram,
        provider: currentProvider
      });
      
    } catch (conversionError) {
      logger.error('Diagram conversion error:', {
        error: conversionError.message,
        stack: conversionError.stack,
        provider: currentProvider
      });
      return res.status(500).json({
        success: false,
        error: conversionError.message || 'Diagram conversion failed',
        details: process.env.NODE_ENV === 'development' ? conversionError.stack : undefined
      });
    }
  } catch (error) {
    logger.error('Convert diagram endpoint error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error during diagram conversion'
    });
  }
});

// Helper function to convert JSON response to Cypher format
// Extracted to utils/cypherConverter.js

// === Diagram Generation Endpoint ===
// Dedicated endpoint for AI-powered diagram generation
// This endpoint is specifically for generating diagrams from text descriptions
// It uses the chat prompt (not threat analysis) to generate Cypher format diagrams
app.post('/api/generate-diagram', async (req, res) => {
  const requestId = req.body.requestId || `gen-${Date.now()}`;
  const controller = new AbortController();
  activeRequests.set(requestId, controller);
  
  // Set up timeout (longer for local LLMs due to metadata extraction, public LLMs need more time for complex systems)
  const isLocalLLM = aiManager.isLocalProvider();
  const GENERATION_TIMEOUT = isLocalLLM ? 120000 : 600000; // 120 seconds for local LLMs, 600 seconds (10 minutes) for public LLMs
  const timeoutId = setTimeout(() => {
    logger.warn(`Diagram generation ${requestId} timed out after ${GENERATION_TIMEOUT}ms`);
    if (!controller.signal.aborted) {
      controller.abort();
      if (!res.headersSent) {
        res.status(504).json({
          error: 'Generation timeout',
          message: 'The diagram generation took too long and was cancelled. Please try with a simpler description or smaller system.',
          requestId: requestId
        });
      }
    }
  }, GENERATION_TIMEOUT);
  
  // Set up cleanup function
  const performCleanup = (reason) => {
    logger.info(`Cleaning up diagram generation request ${requestId} (reason: ${reason})`);
    
    // Clear the timeout
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    
    if (controller && !controller.signal.aborted) {
      try {
        controller.abort();
      } catch (e) {
        logger.debug(`Error aborting controller for ${requestId}:`, e.message);
      }
    }
    if (activeRequests.has(requestId)) {
      activeRequests.delete(requestId);
    }
  };
  
  // Handle client disconnect - use res.on('close') which is more reliable
  res.on('close', () => {
    logger.info(`Client disconnected during diagram generation ${requestId}`);
    performCleanup('client_disconnect');
  });
  
  try {
    const { description, generationType = 'technical', context = {} } = req.body;
    const generationStartTime = Date.now();
    
    logger.info('\n=== Incoming Diagram Generation Request ===');
    logger.info('Generation request details:', {
      requestId,
      descriptionLength: description?.length,
      generationType,
      contextKeys: context ? Object.keys(context) : 'no context',
      isImprovementPass: context?.isImprovementPass || false,
      passNumber: context?.passNumber || 1,
      timestamp: new Date().toISOString()
    });

    if (!description) {
      return res.status(400).json({ error: 'Description is required' });
    }

    // Verify AI provider is configured
    const currentProvider = aiManager.getCurrentProvider();
    if (!currentProvider) {
      return res.status(400).json({
        error: 'Configuration Error',
        message: 'No AI provider is currently configured',
        details: 'Please configure an AI provider in the settings panel before generating diagrams.'
      });
    }
    
    // Check if the provider is properly initialized
    try {
      await aiManager.testProvider(currentProvider);
    } catch (error) {
      logger.error(`Provider ${currentProvider} failed initialization test:`, error);
      return res.status(400).json({
        error: 'Provider Error',
        message: `The current provider (${currentProvider}) is not properly configured: ${error.message}`,
        details: 'Please check your API key in the settings panel and try again.'
      });
    }
    
    logger.info('Using AI provider for diagram generation:', aiManager.getCurrentProvider());

    // Check if user explicitly mentioned zones in their description
    const hasExplicitZones = (text) => {
      // Look for explicit zone assignments, not just zone-related words
      const explicitZonePatterns = [
        /\b(in|within|inside|placed in|located in)\s+(the\s+)?(dmz|internet|external|internal|production|restricted|trusted|cloud)\s+zone/i,
        /\bzone\s*[:=]\s*["']?(dmz|internet|external|internal|production|restricted|trusted|cloud)/i,
        /\b(dmz|internet|external|internal|production|restricted|trusted|cloud)\s+zone\s*(components?|servers?|systems?)/i,
        /\bsecurity\s+zones?\s*[:=]/i,
        /\bnetwork\s+zones?\s*[:=]/i
      ];
      
      // Don't count casual mentions of words like "internal", "production", etc.
      // Only count if they're explicitly used in zone context
      return explicitZonePatterns.some(pattern => pattern.test(text));
    };

    const userMentionedZones = hasExplicitZones(description);
    logger.info(`User explicitly mentioned zones: ${userMentionedZones}`);

    // Build the diagram generation prompt
    // This is a simplified version that directly creates the prompt without going through formatters
    const systemPrompt = `You are **ContextCypher**, the built-in AI assistant inside the "AI-Threat-Modeler" web application.

You are helping generate a system architecture diagram from a text description.

CRITICAL: You must respond ONLY with a Cypher graph format diagram. No explanations, no markdown formatting outside of the cypher code block.

Your response must follow this exact format:
\`\`\`cypher
CREATE (:SystemMetadata {generationType:'${generationType}', timestamp:'${new Date().toISOString()}'})
// Your diagram nodes and edges here
\`\`\`

CRITICAL FORMATTING RULES:
- Start with the SystemMetadata node as shown above
- Each node must have an id, label, and appropriate properties
- Use proper Cypher syntax for nodes and edges
- Include all necessary security properties (zone, dataClassification, etc.)
- Connect all components appropriately`;

    // Check if we should use dynamic mode selection
    const useDynamicSelection = generationType === 'auto' || generationType === 'dynamic';
    
    // Get the generation prompt based on type
    let generationPrompt = '';
    
    // Handle improvement passes differently
    if (context?.isImprovementPass) {
      generationPrompt = `# IMPROVEMENT PASS ${context.passNumber || 2}

You previously generated a diagram that has specific issues that need to be fixed.
Your task is to output an IMPROVED Cypher diagram that addresses these issues while maintaining all valid components.

## CRITICAL RULES:
1. Output ONLY the complete improved Cypher diagram
2. Fix ALL the issues mentioned in the improvement request
3. Maintain all existing valid components and connections
4. Use proper node types from the valid list
5. Ensure every component has at least one connection
6. Use exact zone names without descriptions

## Valid Node Types:
${getValidNodeTypesString()}

## Valid Zones:
${getValidSecurityZones().join(', ')}

## RESPONSE FORMAT:
\`\`\`cypher
// Your improved diagram here
\`\`\``;
    } else if (useDynamicSelection) {
      // Dynamic self-selection prompt
      generationPrompt = `# PRIORITY TASK: Generate Security Architecture in Cypher Graph Format

## DYNAMIC MODE SELECTION
You must first analyze the system description and select the appropriate generation mode.

### STEP 1: ANALYZE SYSTEM
Extract and count ALL components mentioned:
- Parse entire description for systems, tools, services
- Look for "deployed", "configured", "integrated with", "using"
- Count explicit numbers ("25 servers", "100 endpoints")
- Count individual services, databases, users, devices
- Include security controls, monitoring tools, external services
- Consider the nature: technical architecture vs business process

### STEP 2: SELECT MODE BASED ON ANALYSIS
1. **DFD MODE** (Traditional threat modeling requested)
   - Use when: User mentions "DFD", "data flow diagram", "STRIDE", "threat model diagram", "trust boundaries"
   - Keywords: "data flows", "external entities", "trust boundary", "STRIDE analysis"
   - Approach: Use only DFD components (dfdActor, dfdProcess, dfdDataStore, dfdTrustBoundary)

2. **TECHNICAL MODE** (<50 components, detailed technical system)
   - Use when: Clear technical components, specific technologies, infrastructure focus
   - Approach: Model exactly as described, no grouping

3. **PROCESS MODE** (>100 components OR workflow/process systems)
   - Use when: Large numbers, healthcare/manufacturing workflows, many similar items
   - Approach: Aggressive grouping (e.g., "Servers (25)"), focus on flow

4. **HYBRID MODE** (50-100 components OR mixed systems)
   - Use when: Medium complexity, mix of technical and business
   - Approach: Smart grouping for 3+ similar items, preserve security components

### STEP 3: APPLY SELECTED MODE RULES
Based on your analysis, follow the specific rules for your selected mode:

**If TECHNICAL**: Model exactly, no grouping, include all vulnerabilities
**If PROCESS**: Group aggressively to <50 nodes, use instanceCount
**If HYBRID**: Group similar items (3+), never group security devices

## GENERATION RULES (ALL MODES):
1. Create SystemMetadata with selected mode
2. Extract ALL components from the entire description (not just structured lists)
3. Create all nodes with proper zones
4. Connect EVERY node using edges/relationships (NOT Connection nodes!)
   - Use MATCH...CREATE syntax: MATCH (a), (b) CREATE (a)-[:CONNECTS]->(b)
   - DO NOT create nodes with label "Connection"
5. Extract metadata from context - "explicitly mentioned" includes narrative descriptions

## RESPONSE FORMAT:
\`\`\`cypher
CREATE (:SystemMetadata {name:'System', selectedMode:'[technical|process|hybrid|dfd]', estimatedComponents:N, generationType:'${generationType}'})
// Your nodes and connections based on selected mode
\`\`\``;
    } else if (generationType === 'technical') {
      generationPrompt = `# PRIORITY TASK: Generate Security Architecture in Cypher Graph Format

## GENERATION MODE: TECHNICAL - MAXIMUM ACCURACY
Model EXACTLY what the user describes, including ALL components and connections.
CRITICAL: Create INDIVIDUAL nodes for each component - NO GROUPING in technical mode!

## COMPREHENSIVE COMPONENT EXTRACTION:

### PHASE 1: EXTRACT ALL COMPONENTS
Read the ENTIRE description and extract ALL mentioned:
- Systems, services, tools, platforms, applications
- Security controls and devices (even if just "deployed" or "configured")
- External integrations and third-party services
- Management, monitoring, and operational tools
- Backup systems, storage, and infrastructure

### EXTRACTION PATTERNS:
- "X deployed at/on Y" → Create component X
- "Integration with X" → Create external service X
- "X system/service for Y" → Create component X
- "X configured/enabled" → Create component X
- "Using X for Y" → Create component X
- "X performed by Y" → Create both X and Y (if Y is a system)

### PARSE EACH SECTION:
- **Architecture/Components sections** → Primary system nodes
- **Security Controls/Deployment sections** → Security infrastructure nodes
- **Operational/Management sections** → Monitoring and management nodes
- **Integration sections** → External service nodes

### PHASE 2: CREATE NODES
Create a node for EVERY component found, including:
☐ All security devices mentioned (even in passing)
☐ All monitoring/logging systems
☐ All external services and integrations
☐ All backup/recovery systems
☐ All management tools and portals
☐ All testing/scanning tools

CRITICAL: Do NOT skip components just because they're mentioned narratively!

## TWO-STEP GENERATION PROCESS:

### STEP 1: CREATE ALL NODES INDIVIDUALLY
Extract and create every component from the description as SEPARATE nodes.

**CRITICAL FOR TECHNICAL MODE:**
- If user mentions "3 nginx servers", create 3 SEPARATE nodes: web-prod-01, web-prod-02, web-prod-03
- If user mentions "Redis cluster with 3 nodes", create 3 SEPARATE nodes: redis-01, redis-02, redis-03
- NEVER use instanceCount or group components in technical mode
- Create individual nodes even for seemingly identical components

**Node metadata fields — populate ONLY from what is explicitly stated or clearly implied in the description:**
- description (1-2 sentence summary of the component's role — use the user's own words)
- dataClassification (Public|Internal|Confidential|Restricted — ONLY if mentioned or obvious from context)
- vendor (ONLY if the user names a specific vendor, e.g., "Apache", "MySQL", "AWS")
- version (ONLY if a specific version number is mentioned, e.g., "v2.4.29", "5.6.35")
- product (ONLY if explicitly named, e.g., "Apache Tomcat", "MySQL Server")
- technology (ONLY if stated, e.g., "Spring Boot 1.5.8", "PHP 7.1.2")
- protocols (ONLY if mentioned: "HTTP", "HTTPS", "MySQL/TCP", etc.)
- securityControls (ONLY controls explicitly described: "ModSecurity WAF", "SSL termination", etc.)
- patchLevel (ONLY if mentioned)
- lastUpdated (ONLY if mentioned)
- category (infrastructure|network|application|cloud|ot — set based on component type)
- accessControl_authentication (ONLY if auth mechanism is described)
- accessControl_authorization (ONLY if authorization is described)

**Security Issues Metadata (extract ONLY what is explicitly described as a problem):**
- vulnerabilities (e.g., ["Default root password", "Weak cipher suites enabled"])
- misconfigurations (e.g., ["WAF in detection-only mode", "Debug port enabled", "Stats without auth"])
- securityGaps (e.g., ["No MFA", "Missing network segmentation"])

IMPORTANT: Do NOT fabricate or assume metadata. If the user does not mention a vendor, version, protocol, or security control for a component, leave that field empty. Only populate fields where the information is clearly stated in or directly implied by the description.

### STEP 2: CONNECT EVERY NODE (MANDATORY)
After creating all nodes, go through EACH node and ensure it has at least one connection.

**CONNECTIVITY VALIDATION CHECKLIST:**
☐ VPN gateways → Connect to firewalls/routers for network access
☐ Admin workstations → Connect to systems they manage
☐ SIEM/monitoring → Connect to systems generating logs
☐ Database firewalls → Connect between apps and databases
☐ Load balancers → Connect to server pools they balance
☐ Security devices → Connect to what they protect
☐ External users → Connect through entry points (VPN, firewall)

**CRITICAL CONNECTION PATTERNS:**
- VPN Gateway → Firewall → Internal Network
- Admin Workstation → Management Network → Target Systems
- SIEM → All systems generating logs
- Database Firewall → sits BETWEEN app and database
- API Gateway → Backend Services
- Users → Entry Points → Applications

**CONNECTION RULES:**
- If it's a security tool, connect it to what it protects/monitors
- If it's a service, connect it to what uses it or what it uses  
- If it's infrastructure, connect it based on logical data flow
- Application servers MUST connect to their databases
- Payment services MUST connect to payment databases
- If unsure, connect it to something logical in the same or adjacent zone

**Edge metadata fields — populate ONLY from what is explicitly stated in the description:**
- label (short description of the data flow, e.g., "Database Query", "API Request", "User Traffic")
- description (1 sentence describing what data flows through this connection — use the user's words)
- protocol (ONLY if mentioned or obvious: e.g., user says "HTTPS" or "MySQL replication")
- encryption (ONLY if explicitly described: "SSL termination", "TLS", "unencrypted", etc.)
- portRange (ONLY if a port number is mentioned: "3306", "8080", "443")
- dataClassification (ONLY if stated or clearly implied by data type)
- securityControls (ONLY if explicitly described for that connection)
- bandwidth (ONLY if mentioned)
- latency (ONLY if mentioned)
- redundancy (ONLY if mentioned)

**VALIDATION RULE:** Number of connections MUST be >= number of nodes. No exceptions.

## KEY RULES:

### PRIORITY 1: MODEL EXACTLY WHAT'S DESCRIBED
- If the user says "vulnerable", model it as vulnerable
- If they mention specific misconfigurations, include them in metadata
- Don't add security controls not mentioned
- Include ALL components as INDIVIDUAL nodes
- Extract EVERY system/tool/service mentioned anywhere in the text
- Parse narrative descriptions for implicit components (e.g., "monitored by X" → create X)

### PRIORITY 2: ACCURATE ZONE PLACEMENT${!userMentionedZones ? `
- Place components in the zones the user specifies
- If a component is described as "between" zones, place it in the source zone and route traffic THROUGH it
- Zone hierarchy: Internet → DMZ → Internal → Production → Restricted` : `
- Place components in the exact zones the user specifies`}

### PRIORITY 3: VALID NODE TYPES
${getValidNodeTypesString()}
- Use lowercase only (e.g., 'server' not 'Server')
- Use 'generic' for unmatched types

### PRIORITY 4: FOLLOW THE TWO-STEP PROCESS
See the TWO-STEP GENERATION PROCESS section above for detailed instructions.

## EXAMPLE - TECHNICAL MODE:
If user says "3 web servers in DMZ", create:
CREATE (web1:Server {id:'web-server-01', label:'web-prod-01', zone:'DMZ', type:'server'})
CREATE (web2:Server {id:'web-server-02', label:'web-prod-02', zone:'DMZ', type:'server'})
CREATE (web3:Server {id:'web-server-03', label:'web-prod-03', zone:'DMZ', type:'server'})

NOT THIS:
CREATE (webServers:Server {id:'web-servers', label:'Web Servers (3)', instanceCount:3})

## RESPONSE FORMAT:
\`\`\`cypher
// System metadata
CREATE (:SystemMetadata {name:'System Name', description:'System description', primaryZone:'Internal', dataClassification:'Internal'})

// STEP 1: Create all nodes INDIVIDUALLY with variable names
// Only include metadata fields that were explicitly mentioned in the description
CREATE (webServer1:WebServer {id:'web-server-01', label:'nginx-01', zone:'DMZ', type:'webServer', description:'Production nginx web server', vendor:'nginx', version:'1.22.1', protocols:'HTTP,HTTPS', securityControls:'TLS'})
CREATE (webServer2:WebServer {id:'web-server-02', label:'nginx-02', zone:'DMZ', type:'webServer', description:'Production nginx web server', vendor:'nginx', version:'1.22.1', protocols:'HTTP,HTTPS', securityControls:'TLS'})
CREATE (database:Database {id:'database-primary', label:'PostgreSQL Primary', zone:'Restricted', type:'database', description:'Primary relational database storing customer data', vendor:'PostgreSQL', version:'14.6', protocols:'PostgreSQL/TCP'})
// ... all other nodes

// STEP 2: Connect every node — include metadata only if explicitly described
MATCH (webServer1), (database) CREATE (webServer1)-[:CONNECTS {label:'Database Query', protocol:'PostgreSQL', portRange:'5432'}]->(database)
MATCH (webServer2), (database) CREATE (webServer2)-[:CONNECTS {label:'Database Query', protocol:'PostgreSQL', portRange:'5432'}]->(database)
// ... all other connections
\`\`\``;
    } else if (generationType === 'process') {
      generationPrompt = `# PRIORITY TASK: Generate Process Flow Diagram in Cypher Graph Format

## GENERATION MODE: PROCESS/WORKFLOW
This mode uses intelligent grouping to create readable diagrams for large process flows and workflows.

## COMPREHENSIVE COMPONENT EXTRACTION:

### PHASE 1: EXTRACT ALL COMPONENTS
Read the ENTIRE description and extract ALL mentioned (will be grouped intelligently):
- Process steps, workflows, and stages
- Systems, services, tools, platforms mentioned anywhere
- Security controls and checkpoints (even if just "deployed" or "configured")
- External integrations and third-party services
- Monitoring, tracking, and operational tools
- User roles, departments, and access points

### EXTRACTION PATTERNS:
- "X deployed/configured" → Create component/group X
- "Integration with X" → Create external service X
- "Using X for Y" → Create component X
- "X system handles Y" → Create component X
- "Monitored by X" → Create monitoring component X

### PARSE EACH SECTION:
- **Process/Workflow sections** → Process flow nodes
- **Systems/Architecture sections** → System component groups
- **Security/Compliance sections** → Security checkpoint nodes
- **Integration sections** → External service nodes

CRITICAL: Group similar components but ensure EVERY type is represented!

## PROCESS MODE RULES:

### 1. AGGRESSIVE INTELLIGENT GROUPING
- **Target: 30-50 nodes maximum** for readability
- Group similar components: "25 monitors" → "Monitors (25)"
- Group by function: "web, app, API servers" → "Application Servers (3)"
- Use instanceCount field to track grouped quantities
- Include detailed descriptions of what's grouped

### 2. METADATA EXTRACTION:
**Node metadata fields — populate ONLY from what is explicitly stated in the description:**
- description (summary of the component/group — use the user's own words)
- dataClassification (ONLY if mentioned or obvious from context)
- vendor (ONLY if explicitly named)
- version (ONLY if a version number is stated)
- product (ONLY if explicitly named)
- technology (ONLY if stated)
- protocols (ONLY if mentioned)
- securityControls (ONLY controls explicitly described)
- category (infrastructure|network|application|cloud|ot)
- instanceCount (MANDATORY for grouped items: 5, 10, 25, etc.)
- accessControl_authentication (ONLY if auth mechanism is described)
- accessControl_authorization (ONLY if authorization is described)

**Security Issues Metadata (extract ONLY what is explicitly described as a problem):**
- vulnerabilities, misconfigurations, securityGaps — ONLY if stated

**Edge metadata fields — populate ONLY from what is explicitly stated:**
- label (short description of the data flow)
- protocol (ONLY if mentioned)
- encryption (ONLY if described)
- portRange (ONLY if a port is mentioned)
- dataClassification (ONLY if stated)
- securityControls (ONLY if described for that connection)

Do NOT fabricate or assume metadata. Leave fields empty if not mentioned.

### 3. FUNCTIONAL FLOW FOCUS
- Emphasize process steps and data flow
- Group supporting infrastructure
- Focus on business/operational logic
- Less emphasis on security boundaries

### 4. ZONE ASSIGNMENT${!userMentionedZones ? `
- Use zones to represent logical areas or stages
- Generic zone is perfectly acceptable for process steps
- Zones can represent departments, stages, or locations` : `
- Use zones as specified by the user`}

### 5. TWO-STEP PROCESS (MANDATORY)
- STEP 1: Create all nodes (can be grouped)
- STEP 2: Connect EVERY node - no orphans allowed
- Validation: connections >= nodes

### 6. VALID NODE TYPES
${getValidNodeTypesString()}
- Use lowercase only (e.g., 'server' not 'Server')
- Use 'generic' for process steps/workflows

## RESPONSE FORMAT - CYPHER GRAPH:
\`\`\`cypher
// System metadata
CREATE (:SystemMetadata {name:'Process Flow', description:'Process workflow diagram', primaryZone:'Internal', dataClassification:'Internal'})

// Create grouped nodes with variable names — only include metadata that was explicitly described
CREATE (patientEntry:Endpoint {id:'patient-entry', label:'Patient Entry Points (5)', zone:'External', type:'endpoint', description:'Patient-facing registration kiosks and check-in terminals', instanceCount:5})
CREATE (triageGate:Generic {id:'triage-gate', label:'Triage Assessment', zone:'Generic', type:'generic', description:'Clinical triage assessment workflow station'})
CREATE (monitors:Monitor {id:'monitors-group', label:'Bedside Monitors (25)', description:'Vital sign monitoring devices at patient bedsides', zone:'Generic', type:'monitor', instanceCount:25, vendor:'Philips', protocols:'HL7'})

// Create process flow connections — only include metadata that was explicitly described
MATCH (patientEntry), (triageGate) CREATE (patientEntry)-[:FLOW {label:'Patient Arrival'}]->(triageGate)
MATCH (triageGate), (monitors) CREATE (triageGate)-[:FLOW {label:'Monitoring Setup', protocol:'HL7'}]->(monitors)
\`\`\``;
    } else if (generationType === 'hybrid') {
      generationPrompt = `# PRIORITY TASK: Generate Security Architecture in Cypher Graph Format

## GENERATION MODE: HYBRID - BALANCED APPROACH
Balance accuracy with readability. Group similar components when there are many.

## COMPREHENSIVE COMPONENT EXTRACTION:

### PHASE 1: EXTRACT ALL COMPONENTS
Read the ENTIRE description and extract ALL mentioned:
- Systems, services, tools, platforms (group similar if 3+)
- Security controls and devices (NEVER group these)
- External integrations and third-party services
- Management, monitoring, and operational tools
- Backup systems, storage, and infrastructure

### EXTRACTION PATTERNS:
- "X deployed at/on Y" → Create component X
- "Integration with X" → Create external service X
- "X system/service for Y" → Create component X
- "X performed by Y" → Create component Y (if it's a system/tool)
- "Using X" → Create component X
- "X configured/enabled" → Create component X

### PARSE EACH SECTION:
- **Architecture sections** → Primary system nodes (group if many)
- **Security sections** → Individual security nodes (NEVER group)
- **Operations sections** → Management/monitoring nodes
- **Integration sections** → External service nodes

### GROUPING RULES:
☐ Security devices → ALWAYS individual nodes
☐ Similar servers/apps → Group if 3+ of same type
☐ External services → Keep separate for boundary analysis
☐ Admin/management → Keep separate for security analysis

CRITICAL: Extract from narrative descriptions, not just structured lists!

## KEY RULES:

### 1. SMART GROUPING
- Group similar components when there are multiple (e.g., 3+ servers of same type)
- MANDATORY: Include instanceCount field for ALL grouped components
- Use descriptive names: "Web Servers (3)", "RabbitMQ Cluster (2)", "Redis Cache (3)"
- NEVER group security devices (firewalls, gateways, etc.)
- NEVER skip components - ALL must be represented (grouped or individual)

### 2. METADATA EXTRACTION:
**Node metadata fields — populate ONLY from what is explicitly stated in the description:**
- description (1-2 sentence summary — use the user's own words)
- dataClassification (ONLY if mentioned or obvious from context)
- vendor (ONLY if explicitly named)
- version (ONLY if a version number is stated)
- product (ONLY if explicitly named)
- technology (ONLY if stated)
- protocols (ONLY if mentioned)
- securityControls (ONLY controls explicitly described)
- patchLevel (ONLY if mentioned)
- lastUpdated (ONLY if mentioned)
- category (infrastructure|network|application|cloud|ot)
- accessControl_authentication (ONLY if auth mechanism is described)
- accessControl_authorization (ONLY if authorization is described)
- instanceCount (MANDATORY for grouped components: 3, 5, 10, etc.)

**Security Issues Metadata (extract ONLY what is explicitly described as a problem):**
- vulnerabilities, misconfigurations, securityGaps — ONLY if stated

**Edge metadata fields — populate ONLY from what is explicitly stated:**
- label (short description of the data flow)
- description (ONLY if the connection's purpose is described)
- protocol (ONLY if mentioned)
- encryption (ONLY if described: "SSL termination", "TLS", "unencrypted", etc.)
- portRange (ONLY if a port is mentioned)
- dataClassification (ONLY if stated)
- securityControls (ONLY if described for that connection)
- bandwidth/latency/redundancy (ONLY if mentioned)

Do NOT fabricate or assume metadata. Leave fields empty if not mentioned.

### 3. ZONE PLACEMENT${!userMentionedZones ? `
- Follow the zone hierarchy for logical placement
- Place components where the user describes them
- Internet | DMZ | Internal | Production | Restricted | Generic | Cloud | Onpremise` : `
- Place components in the exact zones the user specifies`}

### 4. TWO-STEP PROCESS (CRITICAL)
- STEP 1: Create ALL nodes (verify nothing is skipped during grouping)
- STEP 2: Connect EVERY node based on logical interactions
- Validation: connections >= nodes (no orphans!)
- Double-check: Did you create nodes for ALL components mentioned?

### 5. BOUNDARY COMPONENTS
When something is "between" zones or "at the boundary":
- Place in the SOURCE zone
- Route traffic THROUGH it: Source → Boundary → Destination

### 6. VALID NODE TYPES
${getValidNodeTypesString()}
- Use lowercase only (e.g., 'server' not 'Server')
- Use 'generic' for unmatched types

### CRITICAL: COMPLETENESS CHECK
Before grouping, list ALL components from the description:
- Verify each component is represented (individually or in a group)
- Ensure instanceCount is present for all groups
- Confirm no components were accidentally omitted

## RESPONSE FORMAT:
\`\`\`cypher
// System metadata
CREATE (:SystemMetadata {name:'System Name', description:'System description', primaryZone:'Internal', dataClassification:'Internal'})

// Create nodes — only include metadata that was explicitly described
CREATE (webServers:Server {id:'web-servers', label:'Web Servers (3)', zone:'DMZ', type:'server', description:'Load-balanced nginx web servers', instanceCount:3, vendor:'nginx', version:'1.22.1', protocols:'HTTP,HTTPS'})
CREATE (database:Database {id:'main-db', label:'Main Database', zone:'Production', type:'database', description:'Primary PostgreSQL database', vendor:'PostgreSQL', version:'14.6'})

// Connect ALL nodes — only include metadata that was explicitly described
MATCH (webServers), (database) CREATE (webServers)-[:CONNECTS {label:'Database Query', protocol:'PostgreSQL', portRange:'5432'}]->(database)
// ... all other connections
\`\`\``;
    } else if (generationType === 'dfd') {
      generationPrompt = `# PRIORITY TASK: Generate Data Flow Diagram (DFD) in Cypher Graph Format

## GENERATION MODE: DFD - TRADITIONAL THREAT MODELING
Create a traditional Data Flow Diagram using DFD notation for STRIDE threat modeling.

## DFD COMPONENTS:

### 1. EXTERNAL ENTITIES (Actors)
- Use type: 'dfdActor'
- Represents: Users, external systems, web apps, REST APIs, Lambda functions, mobile apps, third-party services
- Properties: actorType (user|system|api|service|external), trustLevel (trusted|untrusted|partial)

### 2. PROCESSES
- Use type: 'dfdProcess'
- Represents: Applications, services, functions, microservices that transform data
- Properties: processType (application|service|function|microservice), technology

### 3. DATA STORES
- Use type: 'dfdDataStore'
- Represents: Databases, file systems, caches, message queues, blob storage
- Properties: storeType (database|file|cache|queue|blob), encryption (atRest|inTransit|both|none)

### 4. TRUST BOUNDARIES
- Use type: 'dfdTrustBoundary'
- Represents: Network boundaries, process boundaries, privilege boundaries
- Properties: boundaryType (network|process|machine|privilege), fromZone, toZone

## DFD GENERATION RULES:

### 1. COMPONENT IDENTIFICATION
- Identify all external entities interacting with the system
- Map all processes that handle or transform data
- Locate all data storage locations
- Define trust boundaries between different privilege/network levels

### 2. DATA FLOW MAPPING
- Connect components with data flows (edges)
- Label each flow with the type of data transmitted
- Indicate protocols and encryption status

### 3. TRUST BOUNDARY PLACEMENT
- Place boundaries between different security contexts
- Mark transitions between network zones
- Identify privilege escalation points

### 4. STRIDE CONSIDERATIONS
Focus on threats relevant to each component type:
- External Entities: Spoofing, Elevation of Privilege
- Processes: All STRIDE categories
- Data Stores: Tampering, Information Disclosure, Denial of Service
- Trust Boundaries: All data crossing must be validated

## RESPONSE FORMAT:
\`\`\`cypher
// System metadata
CREATE (:SystemMetadata {name:'System Name', description:'DFD for threat modeling', generationType:'dfd'})

// External entities
CREATE (webUser:DFDActor {id:'web-user', label:'Web User', type:'dfdActor', actorType:'user', trustLevel:'untrusted', zone:'Internet'})
CREATE (mobileApp:DFDActor {id:'mobile-app', label:'Mobile Application', type:'dfdActor', actorType:'system', trustLevel:'partial', zone:'Internet'})

// Processes
CREATE (webApi:DFDProcess {id:'web-api', label:'Web API', type:'dfdProcess', processType:'service', technology:'Node.js', zone:'DMZ'})
CREATE (authService:DFDProcess {id:'auth-service', label:'Authentication Service', type:'dfdProcess', processType:'service', zone:'Internal'})

// Data stores
CREATE (userDb:DFDDataStore {id:'user-db', label:'User Database', type:'dfdDataStore', storeType:'database', encryption:'atRest', zone:'Internal'})

// Trust boundaries
CREATE (dmzBoundary:DFDTrustBoundary {id:'dmz-boundary', label:'Internet-DMZ Boundary', type:'dfdTrustBoundary', boundaryType:'network', fromZone:'Internet', toZone:'DMZ'})

// Data flows
MATCH (webUser), (webApi) CREATE (webUser)-[:DATA_FLOW {label:'HTTP Request', protocol:'HTTPS', dataType:'User Input'}]->(webApi)
MATCH (webApi), (authService) CREATE (webApi)-[:DATA_FLOW {label:'Auth Request', protocol:'gRPC', encryption:'TLS'}]->(authService)
MATCH (authService), (userDb) CREATE (authService)-[:DATA_FLOW {label:'Query User', protocol:'SQL', encryption:'TLS'}]->(userDb)
\`\`\``;
    }

    const fullPrompt = `${systemPrompt}

${generationPrompt}

User's system description:
${description}`;

    logger.info('Sending diagram generation request to AI provider');
    
    // Get current provider and model
    const diagramCurrentProvider = aiManager.getCurrentProvider();
    const currentModel = aiManager.getCurrentModel();
    
    // Get diagram generation configuration from model profiles
    const diagramConfig = getDiagramGenerationConfig(diagramCurrentProvider, currentModel);
    
    logger.info(`Provider detection: currentProvider=${diagramCurrentProvider}, model=${currentModel}, useJsonFormat=${diagramConfig.useJsonFormat}`);
    
    let messages;
    if (diagramConfig.useJsonFormat) {
      logger.info('Using JSON-based approach for diagram generation');
      
      // For local LLMs, use a simple JSON-based approach
      // Get categorized node types for better guidance
      const allNodeTypes = getValidNodeTypes();
      const nodeTypesByCategory = {
        infrastructure: ['server', 'database', 'router', 'switch', 'storage', 'backup', 'mainframe', 'virtualMachine'],
        security: ['firewall', 'waf', 'ids', 'ips', 'siem', 'soar', 'antivirus', 'dlp', 'hids', 'nids'],
        application: ['api', 'webServer', 'application', 'microservice', 'function', 'container', 'middleware'],
        network: ['loadBalancer', 'proxy', 'vpnGateway', 'gateway', 'dns', 'dhcp', 'switch', 'router'],
        monitoring: ['monitor', 'logging', 'metrics', 'alerting', 'dashboard', 'analytics'],
        cloud: ['cdn', 'cloudStorage', 'cloudFunction', 'cloudDatabase', 'saas', 'paas', 'iaas'],
        authentication: ['authServer', 'ldap', 'adServer', 'mfa', 'sso', 'iam', 'pam'],
        data: ['dataLake', 'dataWarehouse', 'etl', 'kafka', 'messageBroker', 'cache', 'queue']
      };
      
      // Build categorized type string
      let categorizedTypes = '';
      for (const [category, types] of Object.entries(nodeTypesByCategory)) {
        const validTypes = types.filter(t => allNodeTypes.includes(t));
        if (validTypes.length > 0) {
          categorizedTypes += `\n  ${category}: ${validTypes.join(', ')}`;
        }
      }
      
      // Use system prompt from model profile if available, otherwise use default
      const localLLMSystemPrompt = diagramConfig.systemPrompt || `You are a system architecture analyzer. Your task is to extract EVERY SINGLE component and connection from the system description provided.

CRITICAL INSTRUCTIONS:
1. You MUST extract ALL components mentioned in the description - do not skip any
2. When a zone lists components (e.g., "includes X, Y, Z"), create ALL of them as separate entries
3. When quantities are mentioned (e.g., "3 servers"), create that exact number of components
4. Read the ENTIRE description before responding - do not stop early
5. DO NOT create components that aren't in the description - the type list below is for REFERENCE ONLY
6. CREATE CONNECTIONS FOR EVERY COMPONENT - This is MANDATORY:
   - No component should be isolated/orphaned
   - Think about logical data flows between components
   - Components in Restricted zones typically store sensitive data accessed by Production services
   - Cross-zone connections are common and expected

Valid component types for REFERENCE (use these to categorize what you find):${categorizedTypes}
  other: generic (use ONLY when no other type fits)

Common zones: ${getValidSecurityZonesString()}

IMPORTANT: Only extract components that are ACTUALLY MENTIONED in the user's description!

Output ONLY valid JSON with this exact structure:
{
  "systemName": "System Name",
  "components": [
    {
      "name": "Component Name", 
      "type": "componentType", 
      "zone": "EXACT zone name from the valid zones list", 
      "description": "optional description",
      "vendor": "vendor name if mentioned (e.g., PostgreSQL, AWS, Microsoft)",
      "version": "version if mentioned (e.g., 14.6, v2.40.1)",
      "product": "specific product name if mentioned (e.g., Veeam Backup)",
      "protocols": ["protocol1", "protocol2"],
      "securityControls": ["control1", "control2"]
    }
  ],
  "connections": [
    {
      "from": "Component Name 1", 
      "to": "Component Name 2", 
      "label": "optional label",
      "protocol": "protocol if mentioned (e.g., PostgreSQL, HTTPS)",
      "encryption": "encryption if mentioned (e.g., TLS, none)"
    }
  ]
}

CRITICAL VALIDATION: 
- The components array must contain EVERY component mentioned in the description
- The connections array must have AT LEAST as many entries as components (no orphans!)
- Every component must appear in at least one connection (as "from" or "to")`;
      
      const localLLMUserPrompt = `Extract ALL components and connections from this system:

${description}

RULES:
1. EXTRACT ONLY the components that are ACTUALLY MENTIONED in the description above
2. DO NOT create components from the example type list - only from what's described
3. If "3 web servers" → create 3 separate components
4. Use EXACT zone names from this list: ${getValidSecurityZones().join(', ')}
5. Include metadata when found:
   - vendor (PostgreSQL, AWS, Microsoft)
   - version (14.6, v2.40.1)
   - protocols (HTTP, HTTPS, SSH)
   - encryption (TLS, SSL, none)
6. CREATE CONNECTIONS - CRITICAL RULES:
   - EVERY component must have at least one connection
   - Connect components based on logical data flow
   - Restricted zone components MUST connect to something (they don't operate in isolation)
   - Common patterns:
     * Applications connect to databases
     * Web servers connect to application servers
     * Services in Production connect to databases in Restricted
     * All external-facing components connect through DMZ
   - CREATE CROSS-ZONE CONNECTIONS where logical (e.g., Production → Restricted for database access)

IMPORTANT: For each component you extract, choose an appropriate type (server, database, firewall, etc.) from the valid types I showed you earlier. DO NOT create one of each type - only create what's in the description!

CRITICAL: Use the EXACT zone name mentioned in the description (e.g., "Production Zone" → zone: "Production", "Restricted Zone" → zone: "Restricted")

CRITICAL CONNECTION REQUIREMENT: The connections array must contain AT LEAST as many connections as there are components. NO ORPHANED COMPONENTS!

Output ONLY the JSON structure with the components FROM THE DESCRIPTION.`;
      
      messages = [
        { role: 'system', content: localLLMSystemPrompt },
        { role: 'user', content: localLLMUserPrompt }
      ];
    } else {
      // Original messages for other models
      logger.info(`Using public AI approach for provider: ${currentProvider}`);
      messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `${generationPrompt}\n\nUser's system description:\n${description}` }
      ];
    }
    
    // Call AI provider directly with abort signal
    // Pass temperature and maxTokens from localLLMConfig (applies to both local and public)
    // Only pass maxTokens for local providers
    const requestOptions = {
      signal: controller.signal,
      temperature: aiManager.localLLMConfig?.temperature,
      timeout: GENERATION_TIMEOUT
    };

    if (aiManager.getCurrentProvider() === 'local') {
      requestOptions.maxTokens = aiManager.localLLMConfig?.maxTokens;
    }
    
    const response = await aiManager.generateResponse(messages, requestOptions);

    logger.info('Received response from AI provider');

    // Extract the content from the response
    let content = '';
    if (response?.choices && response.choices[0]?.message?.content) {
      content = response.choices[0].message.content;
    } else if (response?.response) {
      content = response.response;
    } else if (response?.content) {
      content = response.content;
    } else if (typeof response === 'string') {
      content = response;
    }

    // Log the actual AI response content for debugging
    logger.info('AI Response Content (first 2000 chars):', content.substring(0, 2000));
    logger.info('AI Response Content length:', content.length);
    
    // Apply model-specific response processor if available
    if (diagramConfig.responseProcessorName) {
      const processor = getProcessor(diagramConfig.responseProcessorName);
      if (processor) {
        content = processor(content);
        logger.info('Applied model-specific response processor');
      }
    }
    
    // Process JSON format responses (for local LLMs)
    if (diagramConfig.useJsonFormat && content) {
      logger.info('Processing response as JSON format');
      
      try {
        // Extract JSON from the response text (handle explanatory text)
        let jsonContent = content;
        
        // Try to extract JSON object from the response
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          jsonContent = jsonMatch[0];
          logger.info('Extracted JSON from response text');
        }
        
        // Try to parse JSON response
        const jsonResponse = JSON.parse(jsonContent);
        
        if (jsonResponse.components && Array.isArray(jsonResponse.components)) {
          logger.info(`Local LLM returned ${jsonResponse.components.length} components`);
          logger.info(`Local LLM returned ${jsonResponse.connections?.length || 0} connections`);
          
          // For local LLMs, return JSON directly instead of converting to Cypher
          content = JSON.stringify(jsonResponse, null, 2);
          
          logger.info('Keeping local LLM response as JSON format');
        } else {
          logger.warn('Local LLM response missing components array');
        }
      } catch (e) {
        logger.warn('Failed to parse local LLM JSON response:', e.message);
        // Check if it's wrapped in a code block
        try {
          const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
          if (codeBlockMatch) {
            const jsonResponse = JSON.parse(codeBlockMatch[1]);
            if (jsonResponse.components) {
              // Keep as JSON for local LLMs
              content = JSON.stringify(jsonResponse, null, 2);
              logger.info('Extracted JSON from code block');
            }
          }
        } catch (e2) {
          logger.error('Failed to extract JSON from code block:', e2.message);
        }
      }
    }
    
    // Initialize counts for validation
    let createCount = 0;
    let matchCount = 0;
    
    // Skip Cypher validation for models using JSON format
    if (!diagramConfig.useJsonFormat) {
      // Count CREATE statements in the response
      createCount = (content.match(/CREATE\s*\(/g) || []).length;
      matchCount = (content.match(/MATCH\s*\(/g) || []).length;
      logger.info('CREATE statements in AI response:', createCount);
      logger.info('MATCH statements in AI response:', matchCount);
    }

    // Validation: Check for orphaned nodes (skip for JSON format)
    if (!diagramConfig.useJsonFormat) {
      logger.info('Starting orphaned node validation...');
    try {
      // Extract node IDs from CREATE statements
      const nodeIdPattern = /CREATE\s*\([^:]+:.*?\{[^}]*id:\s*['"]([^'"]+)['"]/g;
      const nodeIds = new Set();
      let match;
      while ((match = nodeIdPattern.exec(content)) !== null) {
        nodeIds.add(match[1]);
      }
      logger.info(`Extracted ${nodeIds.size} node IDs from CREATE statements`);
      
      // Extract node IDs used in MATCH statements
      const matchPattern = /MATCH\s*\(([^)]+)\)/g;
      const connectedNodeVars = new Set();
      while ((match = matchPattern.exec(content)) !== null) {
        const vars = match[1].split(',').map(v => v.trim());
        vars.forEach(v => connectedNodeVars.add(v));
      }
      
      // Always check for orphaned nodes by looking at actual connections
      logger.info(`Checking connections: ${connectedNodeVars.size} unique variables in MATCH statements`);
      
      if (nodeIds.size > 0) {
        // Log for debugging
        logger.info(`VALIDATION: ${nodeIds.size} nodes created, ${matchCount} MATCH statements found, ${connectedNodeVars.size} unique node vars in MATCH`);
        
        // Try to identify specific orphaned nodes by parsing variable names
        const createVarPattern = /CREATE\s*\(([^:]+):[^{]+\{[^}]*id:\s*['"]([^'"]+)['"]/g;
        const nodeVarToId = new Map();
        const contentReset = content;
        while ((match = createVarPattern.exec(contentReset)) !== null) {
          nodeVarToId.set(match[1].trim(), match[2]);
        }
        
        // Enhanced connectivity validation using graph traversal
        const findConnectivityIssues = (nodeVarToId, content) => {
          // Build adjacency list from MATCH statements
          const adjacencyList = new Map();
          const edgePattern = /MATCH\s*\(([^)]+)\)\s*,\s*\(([^)]+)\)\s*CREATE\s*\([^)]+\)-\[[^\]]+\]->\([^)]+\)/g;
          
          // Initialize all nodes in adjacency list
          for (const [varName, nodeId] of nodeVarToId) {
            adjacencyList.set(varName, new Set());
          }
          
          // Parse edges from MATCH...CREATE statements
          let edgeMatch;
          while ((edgeMatch = edgePattern.exec(content)) !== null) {
            const var1 = edgeMatch[1].trim();
            const var2 = edgeMatch[2].trim();
            
            // Add bidirectional edges for connectivity analysis
            if (adjacencyList.has(var1)) {
              adjacencyList.get(var1).add(var2);
            }
            if (adjacencyList.has(var2)) {
              adjacencyList.get(var2).add(var1);
            }
          }
          
          // Find connected components using DFS
          const visited = new Set();
          const components = [];
          
          const dfs = (node, component) => {
            visited.add(node);
            component.push(node);
            
            const neighbors = adjacencyList.get(node) || new Set();
            for (const neighbor of neighbors) {
              if (!visited.has(neighbor)) {
                dfs(neighbor, component);
              }
            }
          };
          
          // Find all connected components
          for (const [varName] of nodeVarToId) {
            if (!visited.has(varName)) {
              const component = [];
              dfs(varName, component);
              components.push(component);
            }
          }
          
          // Identify disconnected components and orphaned nodes
          const mainComponent = components.reduce((largest, current) => 
            current.length > largest.length ? current : largest, []);
          
          const issues = {
            orphanedNodes: [],
            disconnectedGroups: [],
            mainComponentSize: mainComponent.length,
            totalComponents: components.length
          };
          
          for (const component of components) {
            if (component !== mainComponent) {
              if (component.length === 1) {
                // Single isolated node
                issues.orphanedNodes.push({
                  varName: component[0],
                  nodeId: nodeVarToId.get(component[0])
                });
              } else {
                // Group of connected nodes isolated from main system
                issues.disconnectedGroups.push({
                  nodes: component.map(varName => ({
                    varName,
                    nodeId: nodeVarToId.get(varName)
                  })),
                  size: component.length
                });
              }
            }
          }
          
          return issues;
        };
        
        // Use enhanced connectivity validation
        const connectivityIssues = findConnectivityIssues(nodeVarToId, content);
        
        logger.info(`Connectivity Analysis:`, {
          totalComponents: connectivityIssues.totalComponents,
          mainComponentSize: connectivityIssues.mainComponentSize,
          orphanedNodes: connectivityIssues.orphanedNodes.length,
          disconnectedGroups: connectivityIssues.disconnectedGroups.length
        });
        
        const hasIssues = connectivityIssues.orphanedNodes.length > 0 || 
                         connectivityIssues.disconnectedGroups.length > 0;
        
        if (hasIssues) {
          logger.warn('CONNECTIVITY ISSUES DETECTED');
          if (connectivityIssues.orphanedNodes.length > 0) {
            logger.warn('Orphaned nodes:', connectivityIssues.orphanedNodes.map(n => n.nodeId));
          }
          if (connectivityIssues.disconnectedGroups.length > 0) {
            logger.warn('Disconnected groups:', connectivityIssues.disconnectedGroups.map(g => 
              `Group of ${g.size}: ${g.nodes.map(n => n.nodeId).join(', ')}`
            ));
          }
          
          const connectivityStartTime = Date.now();
          logger.info('Initiating second pass to fix connectivity issues...', {
            elapsedTime: connectivityStartTime - generationStartTime,
            remainingTimeout: GENERATION_TIMEOUT - (connectivityStartTime - generationStartTime),
            isLocalLLM
          });
          
          // Always attempt to fix connectivity issues regardless of LLM type
          // The client-side multipass system will handle more complex improvements
          
          // Second pass: Ask AI to fix connectivity issues
          try {
            // Extract a summary of existing nodes to help AI make connections
            const nodeSummary = Array.from(nodeVarToId).map(([varName, id]) => `${varName}: ${id}`).join('\n');
            
            // Build the connectivity fix prompt (concise for JSON format)
            let connectPrompt;
            if (diagramConfig.useJsonFormat) {
              connectPrompt = `Fix connectivity issues in the Cypher diagram.

ISSUES:`;
            } else {
              connectPrompt = `You generated a Cypher diagram but there are connectivity issues that need to be fixed.

## CONNECTIVITY ISSUES FOUND:`;
            }

            // Add orphaned nodes section if any
            if (connectivityIssues.orphanedNodes.length > 0) {
              connectPrompt += `\n\n### ORPHANED NODES (no connections):
${connectivityIssues.orphanedNodes.map(n => `- ${n.varName}: ${n.nodeId}`).join('\n')}`;
            }

            // Add disconnected groups section if any
            if (connectivityIssues.disconnectedGroups.length > 0) {
              connectPrompt += `\n\n### DISCONNECTED COMPONENT GROUPS (isolated from main system):`;
              for (const group of connectivityIssues.disconnectedGroups) {
                connectPrompt += `\n\nGroup of ${group.size} nodes:
${group.nodes.map(n => `- ${n.varName}: ${n.nodeId}`).join('\n')}`;
              }
            }

            // Different prompt for JSON format vs Cypher format
            if (diagramConfig.useJsonFormat) {
              connectPrompt += `\n\nNODES:
${nodeSummary}

TASK: Create MATCH statements to connect orphaned nodes.
Output ONLY Cypher MATCH...CREATE statements like:
MATCH (c1), (c4) CREATE (c1)-[:CONNECTS {label:'Network Access'}]->(c4)`;
            } else {
              connectPrompt += `\n\n## ALL NODES IN THE SYSTEM:
${nodeSummary}

## YOUR TASK:
Based on the node IDs and their logical relationships, provide ONLY the missing MATCH...CREATE statements to connect:
1. All orphaned nodes to appropriate parts of the system
2. All disconnected groups to the main system

## CONNECTION PATTERNS TO CONSIDER:
- VPN gateways typically connect to firewalls or routers
- Admin workstations connect to management networks or directly to systems they manage
- SIEM/monitoring systems connect to all systems generating logs
- Database firewalls sit between applications and databases
- Components in Management/Admin zones often connect to Internal zone components
- Security devices connect to what they protect

## RULES:
- Output ONLY MATCH...CREATE statements
- Each orphaned node needs at least one connection
- Each disconnected group needs at least one connection to the main system
- CRITICAL: You MUST use ONLY the exact variable names from the "ALL NODES IN THE SYSTEM" list above
- CRITICAL: Both nodes in each MATCH statement MUST exist in the list above
- DO NOT reference nodes that don't exist (like mainFirewall, siem, etc. unless they are in the list)
- Consider the zones when making connections (prefer adjacent zones)

## EXAMPLE OUTPUT (using ONLY nodes from the list):
MATCH (c1), (c4) CREATE (c1)-[:CONNECTS {label:'Network Access'}]->(c4)
MATCH (c6), (c5) CREATE (c6)-[:CONNECTS {label:'Server Connection'}]->(c5)
MATCH (c10), (c9) CREATE (c10)-[:PROTECTS {label:'Security'}]->(c9)`;
            }

            logger.info('Requesting connections to fix connectivity issues...');
            const fixResponse = await aiManager.generateResponse([
              { role: 'system', content: 'You are a diagram connection expert. Output only Cypher MATCH...CREATE statements. DO NOT use bullet points, asterisks, or any formatting. Each line should be a valid Cypher statement.' },
              { role: 'user', content: connectPrompt }
            ], { 
              signal: controller.signal,
              temperature: aiManager.localLLMConfig?.temperature,
              maxTokens: aiManager.localLLMConfig?.maxTokens
            });

            // Extract the fix content
            let fixContent = '';
            if (fixResponse?.choices && fixResponse.choices[0]?.message?.content) {
              fixContent = fixResponse.choices[0].message.content;
            } else if (fixResponse?.response) {
              fixContent = fixResponse.response;
            } else if (fixResponse?.content) {
              fixContent = fixResponse.content;
            } else if (typeof fixResponse === 'string') {
              fixContent = fixResponse;
            }

            if (fixContent && fixContent.includes('MATCH')) {
              logger.info('Successfully generated connections to fix connectivity issues');
              // Append the new connections to the original content
              content = content.replace(/```$/, '') + '\n\n// Additional connections to fix connectivity issues:\n' + fixContent.replace(/```cypher|```/g, '') + '\n```';
            }
          } catch (fixError) {
            logger.error('Failed to fix connectivity issues:', fixError);
            // Continue with original content even if fix fails
          }
        }
      }
    } catch (validationError) {
      logger.error('Error during node validation:', validationError);
      // Don't fail the request, just log the validation error
    }
    } // End of !isLocalLLM check

    // Clean up before sending response
    performCleanup('success');
    
    // Return the raw response for the frontend to parse
    res.json({
      success: true,
      content: content,
      generationType: generationType,
      timestamp: new Date().toISOString(),
      format: isLocalLLM ? 'json' : 'cypher' // Indicate format to frontend
    });

  } catch (error) {
    // Check if it was cancelled
    if (error.name === 'AbortError' || controller.signal.aborted) {
      logger.info(`Diagram generation ${requestId} was cancelled`);
      if (!res.headersSent) {
        res.status(499).json({
          error: 'Generation cancelled by user',
          requestId: requestId
        });
      }
    } else {
      logger.error('Diagram Generation API Error:', {
        requestId: requestId,
        error: error.message,
        type: error.constructor.name,
        stack: error.stack
      });
      
      if (!res.headersSent) {
        res.status(500).json({
          error: 'Diagram generation failed',
          message: error.message
        });
      }
    }
  } finally {
    // Clean up the request
    performCleanup('request_complete');
  }
});

// === Diagram Context Analysis Endpoint ===
// Analyzes user context to recommend the best generation mode
app.post('/api/analyze-diagram-context', async (req, res) => {
  try {
    const { context } = req.body;
    
    logger.info('\n=== Diagram Context Analysis Request ===');
    logger.info('Context length:', context?.length || 0);

    if (!context) {
      return res.status(400).json({ error: 'Context is required' });
    }

    // Verify AI provider is configured
    const currentProvider = aiManager.getCurrentProvider();
    if (!currentProvider) {
      return res.status(400).json({
        error: 'Configuration Error',
        message: 'No AI provider configured. Please check your settings.',
        errorType: 'provider_not_configured'
      });
    }

    // Create analysis prompt
    const analysisPrompt = `# TASK: Analyze System Context for Diagram Generation

You must analyze the following system description and determine the best diagram generation mode.

## Generation Modes:
1. **Technical Mode**: For detailed technical architectures (<50 components)
   - Use when: System has clear technical details, specific technologies, detailed security requirements
   - Example: "AWS infrastructure with VPC, EC2 instances, RDS databases, CloudFront CDN"

2. **Process Mode**: For large workflows or process-heavy systems (>100 components)
   - Use when: Healthcare workflows, manufacturing processes, business workflows, many similar components
   - Example: "Patient flow through 50 departments with 200 monitoring devices"

3. **Hybrid Mode**: For mixed technical/business systems (50-100 components)
   - Use when: Mix of technical and business components, moderate complexity
   - Example: "E-commerce platform with customer journey and backend infrastructure"

## Analysis Criteria:
- Count explicit components mentioned (servers, databases, users, devices, etc.)
- Look for quantity indicators ("hundreds of", "25 monitors", "cluster of 10")
- Identify workflow/process language vs technical architecture language
- Consider grouping potential (many similar items that could be grouped)

## Response Format:
You must respond with ONLY a JSON object (no markdown, no explanation):
{
  "estimatedNodeCount": <number>,
  "complexity": "low|medium|high|very-high",
  "recommendedMode": "technical|process|hybrid",
  "reasoning": "<brief explanation>",
  "hasLargeGroups": <boolean>,
  "primarySystemType": "technical|workflow|mixed"
}

## User's System Description:
${context}`;

    logger.info('Sending context analysis request to AI');
    
    // Call AI provider
    // Only pass maxTokens for local providers
    const requestOptions = {
      temperature: aiManager.localLLMConfig?.temperature
    };
    
    if (aiManager.getCurrentProvider() === 'local') {
      requestOptions.maxTokens = aiManager.localLLMConfig?.maxTokens;
    }
    
    const response = await aiManager.generateResponse([
      { role: 'system', content: 'You are a system architecture analyst. Analyze the context and respond with ONLY valid JSON.' },
      { role: 'user', content: analysisPrompt }
    ], requestOptions);

    // Extract content
    let content = '';
    if (response?.choices && response.choices[0]?.message?.content) {
      content = response.choices[0].message.content;
    } else if (response?.response) {
      content = response.response;
    } else if (response?.content) {
      content = response.content;
    } else if (typeof response === 'string') {
      content = response;
    }

    logger.info('Received analysis response from AI');

    // Parse the JSON response
    let analysis;
    try {
      // Remove any markdown code blocks if present
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysis = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      logger.error('Failed to parse AI analysis response:', parseError);
      // Fallback analysis based on simple heuristics
      const charCount = context.length;
      const bulletCount = (context.match(/^[\s]*[-*•]/gm) || []).length;
      const estimatedNodes = Math.max(bulletCount, Math.floor(charCount / 75));
      
      analysis = {
        estimatedNodeCount: estimatedNodes,
        complexity: estimatedNodes > 100 ? 'very-high' : estimatedNodes > 50 ? 'high' : estimatedNodes > 20 ? 'medium' : 'low',
        recommendedMode: estimatedNodes > 100 ? 'process' : estimatedNodes > 50 ? 'hybrid' : 'technical',
        reasoning: 'Based on content analysis heuristics',
        hasLargeGroups: estimatedNodes > 100,
        primarySystemType: 'mixed'
      };
    }

    logger.info('Analysis result:', analysis);

    res.json({
      success: true,
      analysis,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Context Analysis API Error:', {
      error: error.message,
      type: error.constructor.name,
      stack: error.stack
    });
    
    res.status(500).json({
      error: 'Context analysis failed',
      message: error.message
    });
  }
});

// Store for active analysis sessions
const activeAnalyses = new Map();

// Store for completed analysis results (with TTL)
const analysisResults = new Map();
const RESULT_TTL = 5 * 60 * 1000; // 5 minutes

// Cleanup old results periodically
setInterval(() => {
  const now = Date.now();
  for (const [id, result] of analysisResults.entries()) {
    if (now - result.timestamp > RESULT_TTL) {
      analysisResults.delete(id);
      logger.info(`[THREAT-ANALYSIS] Cleaned up old result: ${id}`);
    }
  }
}, 60000); // Check every minute

// === Get Threat Analysis Result Endpoint ===
app.get('/api/threat-analysis/result/:id', async (req, res) => {
  const { id } = req.params;
  
  logger.info(`[THREAT-ANALYSIS-RESULT] Fetching result for ID: ${id}`);
  
  const result = analysisResults.get(id);
  if (!result) {
    logger.warn(`[THREAT-ANALYSIS-RESULT] Result not found for ID: ${id}`);
    return res.status(404).json({ 
      success: false, 
      error: 'Analysis result not found or expired' 
    });
  }
  
  logger.info(`[THREAT-ANALYSIS-RESULT] Returning result for ID: ${id}, size: ${JSON.stringify(result.data).length} bytes`);
  res.json({
    success: true,
    data: result.data,
    timestamp: result.timestamp
  });
});

// === Threat Analysis Cancellation Endpoint ===
app.post('/api/threat-analysis/cancel', async (req, res) => {
  const { analysisId } = req.body;
  
  if (!analysisId) {
    return res.status(400).json({ success: false, error: 'Missing analysisId' });
  }
  
  const session = activeAnalyses.get(analysisId);
  if (session) {
    session.cancelled = true;
    logger.info(`[THREAT-ANALYSIS] Analysis cancelled: ${analysisId}`);
    res.json({ success: true, message: 'Analysis cancellation requested' });
  } else {
    res.status(404).json({ success: false, error: 'Analysis session not found' });
  }
});

// === Threat Analysis SSE Endpoint (with progress) ===
app.post('/api/threat-analysis/sse', async (req, res) => {
  const requestId = `req-${Date.now()}-${crypto.randomBytes(5).toString('hex')}`;
  logger.info(`[THREAT-ANALYSIS-SSE] ========== NEW SSE REQUEST ${requestId} ==========`);
  
  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Content-Encoding', 'none'); // Explicitly disable compression
  
  // Disable Node.js buffering for real-time SSE
  if (res.socket) {
    res.socket.setNoDelay(true);
    res.socket.setKeepAlive(true);
  }
  
  // Send initial connection event
  res.write(`data: ${JSON.stringify({ type: 'connection', message: 'Connected', requestId })}\n\n`);
  res.flushHeaders();
  
  // Handle client disconnect
  req.on('close', () => {
    logger.info(`[THREAT-ANALYSIS-SSE] Client disconnected for request ${requestId}`);
    const { analysisId } = req.body || {};
    if (analysisId) {
      const session = activeAnalyses.get(analysisId);
      if (session) {
        session.cancelled = true;
        activeAnalyses.delete(analysisId);
      }
    }
  });
  
  try {
    const { diagram, componentIds = [], analysisType = 'comprehensive', context = {}, analysisId } = req.body || {};
    
    logger.info(`[THREAT-ANALYSIS-SSE] Request ${requestId} details:`, {
      analysisId,
      componentIds,
      analysisType,
      nodeCount: diagram?.nodes?.length,
      edgeCount: diagram?.edges?.length
    });

    if (!diagram || !Array.isArray(diagram.nodes) || !Array.isArray(diagram.edges)) {
      res.write(`data: ${JSON.stringify({ type: 'error', error: 'Missing or invalid diagram' })}\n\n`);
      return res.end();
    }
    
    // Check if this analysis ID is already being processed
    if (analysisId && activeAnalyses.has(analysisId)) {
      logger.warn(`[THREAT-ANALYSIS-SSE] Duplicate analysis request detected for ID: ${analysisId}`);
      res.write(`data: ${JSON.stringify({ 
        type: 'error', 
        error: 'Analysis already in progress',
        analysisId 
      })}\n\n`);
      return res.end();
    }

    // Create analysis session
    const sessionId = analysisId || `analysis-${Date.now()}-${crypto.randomBytes(5).toString('hex')}`;
    const analysisSession = {
      id: sessionId,
      requestId,
      cancelled: false,
      startTime: Date.now()
    };
    
    if (analysisId) {
      activeAnalyses.set(analysisId, analysisSession);
      logger.info(`[THREAT-ANALYSIS-SSE] Created analysis session: ${analysisId} for request ${requestId}`);
    }
    
    // Verify AI provider is configured
    const currentProvider = aiManager.getCurrentProvider();
    if (!currentProvider) {
      res.write(`data: ${JSON.stringify({ 
        type: 'error', 
        error: 'AI provider not configured' 
      })}\n\n`);
      return res.end();
    }

    logger.info(`[THREAT-ANALYSIS-SSE] Using AI provider: ${aiManager.getCurrentProvider()}`);

    // Initialize the SimplifiedThreatAnalyzer with progress callback
    const SimplifiedThreatAnalyzer = require('./services/SimplifiedThreatAnalyzer');
    const threatAnalyzer = new SimplifiedThreatAnalyzer(aiManager);

    // Progress callback for real-time updates
    const progressCallback = (progress) => {
      if (!res.writableEnded && !res.destroyed) {
        res.write(`data: ${JSON.stringify({ 
          type: 'progress', 
          ...progress,
          timestamp: new Date().toISOString()
        })}\n\n`);
        
        // Flush to ensure immediate delivery
        if (res.flush && typeof res.flush === 'function') {
          res.flush();
        }
      }
    };

    // Perform threat analysis with progress callback
    let result;
    try {
      result = await threatAnalyzer.analyzeThreatPaths(
        diagram, 
        componentIds, 
        analysisType,
        { 
          ...context, 
          isThreatAnalysisEndpoint: true, 
          analysisSession,
          analysisId: sessionId,
          requestId,
          progressCallback // Pass progress callback
        }
      );
      
      // Store the result for later retrieval
      analysisResults.set(sessionId, {
        data: result,
        timestamp: Date.now()
      });
      
      logger.info(`[THREAT-ANALYSIS-SSE] Stored result for ID: ${sessionId}, size: ${JSON.stringify(result).length} bytes`);
      
      // Send completion notification with result ID
      if (!res.writableEnded && !res.destroyed) {
        res.write(`data: ${JSON.stringify({ 
          type: 'complete', 
          analysisId: sessionId,
          resultId: sessionId,
          message: 'Analysis complete. Fetch result using the resultId.'
        })}\n\n`);
        
        // Ensure data is flushed
        if (res.flush && typeof res.flush === 'function') {
          res.flush();
        }
      }
      
    } catch (analysisError) {
      logger.error('[THREAT-ANALYSIS-SSE] Analysis failed:', analysisError);
      if (!res.writableEnded && !res.destroyed) {
        res.write(`data: ${JSON.stringify({ 
          type: 'error', 
          error: analysisError.message,
          details: process.env.NODE_ENV === 'development' ? analysisError.stack : undefined
        })}\n\n`);
      }
    } finally {
      // Clean up session
      if (analysisId) {
        activeAnalyses.delete(analysisId);
      }
      res.end();
    }
    
  } catch (error) {
    logger.error('[THREAT-ANALYSIS-SSE] Request processing error:', error);
    if (!res.writableEnded && !res.destroyed) {
      res.write(`data: ${JSON.stringify({ 
        type: 'error', 
        error: error.message 
      })}\n\n`);
    }
    res.end();
  }
});

// === Threat Analysis Endpoint ===
app.post('/api/threat-analysis', async (req, res) => {
  const requestId = `req-${Date.now()}-${crypto.randomBytes(5).toString('hex')}`;
  logger.info(`[THREAT-ANALYSIS] ========== NEW REQUEST ${requestId} ==========`);
  
  try {
    const { diagram, componentIds = [], analysisType = 'comprehensive', context = {}, analysisId } = req.body || {};
    
    logger.info(`[THREAT-ANALYSIS] Request ${requestId} details:`, {
      analysisId,
      componentIds,
      analysisType,
      nodeCount: diagram?.nodes?.length,
      edgeCount: diagram?.edges?.length
    });

    if (!diagram || !Array.isArray(diagram.nodes) || !Array.isArray(diagram.edges)) {
      return res.status(400).json({ success: false, error: 'Missing or invalid diagram' });
    }
    
    // Check if this analysis ID is already being processed
    if (analysisId && activeAnalyses.has(analysisId)) {
      logger.warn(`[THREAT-ANALYSIS] Duplicate analysis request detected for ID: ${analysisId}`);
      return res.status(409).json({ 
        success: false, 
        error: 'Analysis already in progress',
        analysisId 
      });
    }

    // Create analysis session if ID provided
    const sessionId = analysisId || `analysis-${Date.now()}-${crypto.randomBytes(5).toString('hex')}`;
    const analysisSession = {
      id: sessionId,
      requestId,
      cancelled: false,
      startTime: Date.now()
    };
    
    if (analysisId) {
      activeAnalyses.set(analysisId, analysisSession);
      logger.info(`[THREAT-ANALYSIS] Created analysis session: ${analysisId} for request ${requestId}`);
    }
    
    logger.info('[THREAT-ANALYSIS] Incoming request', {
      components: componentIds.length,
      nodes: diagram.nodes.length,
      edges: diagram.edges.length,
      analysisType,
      analysisId: sessionId,
      requestId
    });

    // Check if AI provider is configured
    if (!aiManager || !aiManager.getCurrentProvider()) {
      logger.warn('[THREAT-ANALYSIS] No AI provider configured');
      return res.status(503).json({ 
        success: false, 
        error: 'No AI provider configured. Please configure an AI provider (e.g., Ollama, OpenAI, Anthropic) in the settings to use threat analysis.',
        providerStatus: 'not_configured'
      });
    }

    // Initialize the SimplifiedThreatAnalyzer with current AI provider
    const SimplifiedThreatAnalyzer = require('./services/SimplifiedThreatAnalyzer');
    const threatAnalyzer = new SimplifiedThreatAnalyzer(aiManager);

    // Perform threat analysis with error handling
    let result;
    try {
      result = await threatAnalyzer.analyzeThreatPaths(
        diagram, 
        componentIds, 
        analysisType,
        { 
          ...context, 
          isThreatAnalysisEndpoint: true, 
          analysisSession,
          analysisId: sessionId,
          requestId 
        } // Pass analysis session and IDs for tracking and cancellation
      );
      
      // Validate result structure
      if (!result || typeof result !== 'object') {
        throw new Error('Invalid analysis result format');
      }
      
      if (!result.content && !result.error) {
        throw new Error('Analysis returned empty result');
      }
      
      if (result.error) {
        throw new Error(`Analysis error: ${result.error}`);
      }
    } catch (analysisError) {
      logger.error('[THREAT-ANALYSIS] Analysis failed:', {
        message: analysisError.message,
        name: analysisError.name,
        stack: analysisError.stack
      });
      return res.status(500).json({ 
        success: false, 
        error: `Threat analysis failed: ${analysisError.message}`,
        errorType: analysisError.name || 'AnalysisError',
        details: process.env.NODE_ENV === 'development' ? {
          stack: analysisError.stack,
          code: analysisError.code
        } : undefined
      });
    }

    // Process the analysis result
    let systemAnalysis = {};
    let componentThreats = {};
    let attackPaths = [];
    let vulnerabilities = [];
    let recommendations = [];
    
    // The new SimplifiedThreatAnalyzer returns a structured response
    if (result.systemAnalysis) {
      // Use the pre-structured data from the new analyzer
      systemAnalysis = result.systemAnalysis;
      componentThreats = systemAnalysis.componentThreats || {};
      attackPaths = systemAnalysis.attackPaths || [];
      vulnerabilities = systemAnalysis.vulnerabilities || [];
      recommendations = systemAnalysis.recommendations || [];
      
      logger.info('[THREAT-ANALYSIS] Using structured response from SimplifiedThreatAnalyzer', {
        componentCount: Object.keys(componentThreats).length,
        attackPathCount: attackPaths.length,
        vulnerabilityCount: vulnerabilities.length,
        recommendationCount: recommendations.length
      });
    } else if (result.content && typeof result.content === 'string') {
      // Fallback: Parse markdown content (for backward compatibility)
      const content = result.content;
      
      // Log the raw content structure for debugging
      logger.info('[THREAT-ANALYSIS] Falling back to markdown parsing:', {
        length: content.length,
        hasSystemOverview: content.includes('## SYSTEM_OVERVIEW'),
        hasComponentThreats: content.includes('## COMPONENT_THREATS'),
        hasAttackPaths: content.includes('## ATTACK_PATHS'),
        hasVulnerabilities: content.includes('## VULNERABILITIES'),
        hasRecommendations: content.includes('## RECOMMENDATIONS')
      });
      
      // Initialize DiagramIndexer for component lookup
      const DiagramIndexer = require('./services/DiagramIndexReader');
      const indexer = new DiagramIndexer();
      indexer.indexDiagram(diagram);
      
      // Parse the structured response based on our format instructions
      // Extract system overview
      const systemOverviewMatch = content.match(/## SYSTEM_OVERVIEW\s*\n([\s\S]*?)(?=\n##|$)/);
      if (systemOverviewMatch) {
        systemAnalysis.overview = systemOverviewMatch[1].trim();
      }
      
      // Extract component threats using DiagramIndexer for better component mapping
      const componentThreatsMatch = content.match(/## COMPONENT_THREATS\s*\n([\s\S]*?)(?=\n##|$)/);
      if (componentThreatsMatch) {
        const componentSection = componentThreatsMatch[1];
        
        // Log the raw component section for debugging
        logger.info('[THREAT-ANALYSIS] Raw COMPONENT_THREATS section:', componentSection.substring(0, 500) + '...');
        
        // Parse each component's threats - handle multiple formats:
        // ### [Component]
        // ### Component (Component ID: ...)
        // ### Component in Zone Zone
        const componentPattern = /### (?:\[(.*?)\]|(.*?)(?:\s*(?:\(Component ID:.*?\)|\s+in\s+.*?\s+[Zz]one))?)\s*\n([\s\S]*?)(?=\n###|\n##|$)/g;
        let componentMatch;
        
        while ((componentMatch = componentPattern.exec(componentSection)) !== null) {
          let componentIdentifier = (componentMatch[1] || componentMatch[2]).trim();
          
          logger.info(`[THREAT-ANALYSIS] Raw component match: "${componentMatch[0].substring(0, 100)}..."`);
          logger.info(`[THREAT-ANALYSIS] Extracted identifier before cleanup: "${componentIdentifier}"`);
          
          // Remove "in Zone Zone" suffix if present
          componentIdentifier = componentIdentifier.replace(/\s+in\s+.*?\s+[Zz]one\s*$/, '').trim();
          const threatText = componentMatch[3];
          
          let componentId = componentIdentifier;
          logger.info(`[THREAT-ANALYSIS] Processing component after cleanup: "${componentIdentifier}"`);
          
          // Try multiple approaches to find the component
          // 1. Try exact label match (case-sensitive)
          let nodeByLabel = indexer.findNodeByLabel(componentIdentifier);
          if (nodeByLabel) {
            componentId = nodeByLabel.node.id;
            logger.info(`[THREAT-ANALYSIS] Found by exact label: ${componentIdentifier} -> ${componentId}`);
          } else {
            // 2. Try case-insensitive label match
            const lowerIdentifier = componentIdentifier.toLowerCase();
            const nodeByLabelCaseInsensitive = diagram.nodes.find(n => 
              n.data?.label?.toLowerCase() === lowerIdentifier || 
              n.data?.name?.toLowerCase() === lowerIdentifier
            );
            if (nodeByLabelCaseInsensitive) {
              componentId = nodeByLabelCaseInsensitive.id;
              logger.info(`[THREAT-ANALYSIS] Found by case-insensitive label: ${componentIdentifier} -> ${componentId}`);
            } else {
              // 3. Try by component code
              const nodeByCode = indexer.getNodeByCode(componentIdentifier);
              if (nodeByCode) {
                componentId = nodeByCode.id;
                logger.info(`[THREAT-ANALYSIS] Found by code: ${componentIdentifier} -> ${componentId}`);
              } else {
                // 4. Try partial match on label (contains)
                const nodeByPartialLabel = diagram.nodes.find(n => 
                  n.data?.label?.includes(componentIdentifier) || 
                  componentIdentifier.includes(n.data?.label || '')
                );
                if (nodeByPartialLabel) {
                  componentId = nodeByPartialLabel.id;
                  logger.info(`[THREAT-ANALYSIS] Found by partial label match: ${componentIdentifier} -> ${componentId}`);
                } else {
                  // 5. Try to match against actual node IDs in diagram
                  const node = diagram.nodes.find(n => n.id === componentIdentifier);
                  if (node) {
                    logger.info(`[THREAT-ANALYSIS] Found by direct ID: ${componentIdentifier}`);
                  } else {
                    // 6. Check if it's an edge identifier (e.g., "Connection from X to Y")
                    const edgeMatch = componentIdentifier.match(/(?:connection|flow|edge)\s+(?:from|between)\s+(.+?)\s+(?:to|and)\s+(.+)/i);
                    if (edgeMatch) {
                      const [_, source, target] = edgeMatch;
                      const edge = diagram.edges.find(e => {
                        const sourceNode = diagram.nodes.find(n => n.id === e.source);
                        const targetNode = diagram.nodes.find(n => n.id === e.target);
                        return (sourceNode?.data?.label?.includes(source) && targetNode?.data?.label?.includes(target)) ||
                               (sourceNode?.data?.label?.includes(target) && targetNode?.data?.label?.includes(source));
                      });
                      if (edge) {
                        componentId = edge.id;
                        logger.info(`[THREAT-ANALYSIS] Found edge by description: ${componentIdentifier} -> ${componentId}`);
                      }
                    } else {
                      logger.warn(`[THREAT-ANALYSIS] Component not found using any method: ${componentIdentifier}`);
                    }
                  }
                }
              }
            }
          }
          
          // Extract individual threats for this component - updated for qualitative assessment
          // Use more robust pattern that captures full threat description including newlines up to the LIKELIHOOD field
          // The [\s\S] pattern matches any character including newlines, with lazy quantifier to stop at first |
          const threatPattern = /THREAT:\s*([\s\S]+?)\s*\|\s*LIKELIHOOD:\s*(Almost Certain|Likely|Possible|Unlikely|Very Unlikely|Rare)\s*\|\s*IMPACT:\s*(Catastrophic|Severe|Major|Moderate|Minor|Negligible)\s*\|\s*RISK:\s*(Extreme|High|Medium|Minor|Sustainable)(?:\s*\|\s*MITRE:\s*([^\n]+))?/gi;
          const threats = [];
          let threatMatch;
          let threatIndex = 0;
          
          while ((threatMatch = threatPattern.exec(threatText)) !== null) {
            const description = threatMatch[1].trim();
            const likelihood = threatMatch[2];
            const impact = threatMatch[3];
            let risk = threatMatch[4];
            const mitreTechniques = threatMatch[5] ? threatMatch[5].trim().split(/,\s*/) : [];
            
            logger.info(`[THREAT-ANALYSIS] Extracted threat for ${componentId}: "${description}" (${description.length} chars)`);
            
            // If risk wasn't provided by AI, calculate it using the matrix
            if (!risk && likelihood && impact) {
              risk = riskMatrix.calculateRisk(likelihood, impact);
            }
            
            threats.push({
              id: `threat-${componentId}-${threatIndex++}`,
              description: description,
              likelihood: likelihood,
              impact: impact,
              risk: risk || 'Medium', // Default to Medium if calculation fails
              type: 'threat',
              mitreTechniques,
            });
          }
          
          // Fallback: Try to extract threats in a more flexible format
          if (threats.length === 0) {
            logger.info(`[THREAT-ANALYSIS] No threats found with main pattern for ${componentId}, trying fallback. Threat text: ${threatText.substring(0, 200)}...`);
            
            // More flexible pattern that doesn't require all fields, supports multi-line descriptions
            const fallbackPattern = /THREAT:\s*([\s\S]+?)(?:\s*\|\s*LIKELIHOOD:\s*(Almost Certain|Likely|Possible|Unlikely|Very Unlikely|Rare))?\s*(?:\|\s*IMPACT:\s*(Catastrophic|Severe|Major|Moderate|Minor|Negligible))?\s*(?:\|\s*RISK:\s*(Extreme|High|Medium|Minor|Sustainable))?(?:\s*\|\s*MITRE:\s*([^\n]+))?(?=\nTHREAT:|$)/gi;
            let fallbackMatch;
            
            while ((fallbackMatch = fallbackPattern.exec(threatText)) !== null) {
              const description = fallbackMatch[1].trim();
              const likelihood = fallbackMatch[2] || 'Possible';
              const impact = fallbackMatch[3] || 'Moderate';
              const risk = fallbackMatch[4] || riskMatrix.calculateRisk(likelihood, impact);
              const mitreTechniques = fallbackMatch[5] ? fallbackMatch[5].trim().split(/,\s*/) : [];
              
              logger.info(`[THREAT-ANALYSIS] Fallback extracted threat for ${componentId}: "${description}" (${description.length} chars)`);
              
              threats.push({
                id: `threat-${componentId}-${threatIndex++}`,
                description: description,
                likelihood: likelihood,
                impact: impact,
                risk: risk,
                type: 'threat',
                mitreTechniques,
              });
            }
          }
          
          if (threats.length > 0) {
            // Validate that the component actually exists in the diagram
            const componentExists = diagram.nodes.some(n => n.id === componentId) || 
                                  diagram.edges.some(e => e.id === componentId);
            
            if (componentExists) {
              componentThreats[componentId] = threats;
              logger.info(`[THREAT-ANALYSIS] Found ${threats.length} threats for component: ${componentId}`);
              // Log first threat description to verify extraction
              logger.info(`[THREAT-ANALYSIS] First threat: "${threats[0].description}"`);
            } else {
              logger.warn(`[THREAT-ANALYSIS] Ignoring threats for non-existent component: ${componentId} (label: ${componentIdentifier})`);
              logger.warn(`[THREAT-ANALYSIS] This may indicate AI hallucination - component not found in diagram`);
            }
          } else {
            logger.warn(`[THREAT-ANALYSIS] No threats extracted for component: ${componentIdentifier} (mapped to ${componentId})`);
            logger.warn(`[THREAT-ANALYSIS] Full threat text: ${threatText}`);
          }
        }
      }
      
      // Extract attack paths
      const attackPathsMatch = content.match(/## ATTACK_PATHS\s*\n([\s\S]*?)(?=\n##|$)/);
      logger.info(`[THREAT-ANALYSIS] Attack paths section found: ${!!attackPathsMatch}`);
      if (attackPathsMatch) {
        logger.info(`[THREAT-ANALYSIS] Attack paths text: ${attackPathsMatch[1].substring(0, 500)}...`);
        // New simplified pattern without risk assessment in attack paths
        const pathPattern = /PATH:\s*(.+?)\s*→\s*(.+?)\s*\|\s*([\s\S]+?)\s*\|\s*MITRE:\s*(.+?)(?=\nPATH:|$)/gi;
        let pathMatch;
        let pathIndex = 0;
        
        while ((pathMatch = pathPattern.exec(attackPathsMatch[1])) !== null) {
          const sourceName = pathMatch[1].trim();
          const targetName = pathMatch[2].trim();
          
          // Try to find actual component IDs for source and target
          let sourceId = sourceName;
          let targetId = targetName;
          
          // Find source component
          const sourceNode = diagram.nodes.find(n => 
            n.data?.label === sourceName || 
            n.data?.label?.toLowerCase() === sourceName.toLowerCase() ||
            n.id === sourceName ||
            indexer.getNodeByCode(sourceName)?.id === n.id
          );
          if (sourceNode) {
            sourceId = sourceNode.id;
          }
          
          // Find target component
          const targetNode = diagram.nodes.find(n => 
            n.data?.label === targetName || 
            n.data?.label?.toLowerCase() === targetName.toLowerCase() ||
            n.id === targetName ||
            indexer.getNodeByCode(targetName)?.id === n.id
          );
          if (targetNode) {
            targetId = targetNode.id;
          }
          
          attackPaths.push({
            id: `path-${pathIndex++}`,
            source: sourceName,
            target: targetName,
            sourceId: sourceId,
            targetId: targetId,
            description: pathMatch[3].trim(),
            mitreTechniques: pathMatch[4] ? pathMatch[4].trim().split(/,\s*/) : [],
            type: 'attack-path'
          });
          
          logger.info(`[THREAT-ANALYSIS] Attack path: ${sourceName} (${sourceId}) → ${targetName} (${targetId})`);
        }
        
        // Add fallback pattern for attack paths without full structure
        if (attackPaths.length === 0 && attackPathsMatch[1].includes('→')) {
          logger.info('[THREAT-ANALYSIS] Trying simplified attack path extraction');
          const simplifiedPathPattern = /(.+?)\s*→\s*(.+?)(?:\s*[-:]?\s*(.+?))?(?=\n|$)/gi;
          let simpleMatch;
          
          while ((simpleMatch = simplifiedPathPattern.exec(attackPathsMatch[1])) !== null) {
            const sourceName = simpleMatch[1].trim();
            const targetName = simpleMatch[2].trim();
            const description = simpleMatch[3]?.trim() || `Attack path from ${sourceName} to ${targetName}`;
            
            attackPaths.push({
              id: `path-${pathIndex++}`,
              source: sourceName,
              target: targetName,
              description: description,
              mitreTechniques: [],
              type: 'attack-path'
            });
          }
        }
      }
      
      // Extract vulnerabilities
      const vulnerabilitiesMatch = content.match(/## VULNERABILITIES\s*\n([\s\S]*?)(?=\n##|$)/);
      logger.info(`[THREAT-ANALYSIS] Vulnerabilities section found: ${!!vulnerabilitiesMatch}`);
      if (vulnerabilitiesMatch) {
        logger.info(`[THREAT-ANALYSIS] Vulnerabilities text: ${vulnerabilitiesMatch[1].substring(0, 500)}...`);
        const vulnPattern = /VULN:\s*([\s\S]+?)\s*\|(?:\s*CVE:\s*(.+?)\s*\|)?(?:\s*CVSS:\s*(.+?)\s*\|)?\s*AFFECTED:\s*(.+?)(?=\nVULN:|$)/gi;
        let vulnMatch;
        let vulnIndex = 0;
        
        while ((vulnMatch = vulnPattern.exec(vulnerabilitiesMatch[1])) !== null) {
          vulnerabilities.push({
            id: `vuln-${vulnIndex++}`,
            description: vulnMatch[1].trim(),
            cve: vulnMatch[2] ? vulnMatch[2].trim() : null,
            cvss: vulnMatch[3] ? parseFloat(vulnMatch[3].trim()) : null,
            affectedComponents: vulnMatch[4].trim().split(/,\s*/),
            type: 'vulnerability'
          });
        }
      }
      
      // Extract recommendations
      const recommendationsMatch = content.match(/## RECOMMENDATIONS\s*\n([\s\S]*?)(?=\n##|$)/);
      if (recommendationsMatch) {
        const recPattern = /\[(EXTREME|HIGH|MEDIUM|MINOR|SUSTAINABLE)\]:\s*([\s\S]+?)(?=\n\[|$)/gi;
        let recMatch;
        let recIndex = 0;
        
        while ((recMatch = recPattern.exec(recommendationsMatch[1])) !== null) {
          recommendations.push({
            id: `rec-${recIndex++}`,
            priority: recMatch[1].toUpperCase(),
            action: recMatch[2].trim(),
            type: 'recommendation'
          });
        }
      }
      
      // Extract overall risk assessment
      const overallRiskMatch = content.match(/## OVERALL_RISK_ASSESSMENT\s*\n([\s\S]*?)(?=\n##|$)/);
      if (overallRiskMatch) {
        const riskText = overallRiskMatch[1];
        const likelihoodMatch = riskText.match(/LIKELIHOOD:\s*(Almost Certain|Likely|Possible|Unlikely|Very Unlikely|Rare)/i);
        const impactMatch = riskText.match(/IMPACT:\s*(Catastrophic|Severe|Major|Moderate|Minor|Negligible)/i);
        const riskMatch = riskText.match(/RISK:\s*(Extreme|High|Medium|Minor|Sustainable)/i);
        const justificationMatch = riskText.match(/JUSTIFICATION:\s*([\s\S]+?)(?=\n|$)/i);
        
        if (likelihoodMatch && impactMatch && riskMatch) {
          systemAnalysis.overallRiskAssessment = {
            likelihood: likelihoodMatch[1],
            impact: impactMatch[1],
            risk: riskMatch[1],
            justification: justificationMatch ? justificationMatch[1].trim() : ''
          };
          
          logger.info('[THREAT-ANALYSIS] Overall risk assessment:', systemAnalysis.overallRiskAssessment);
        }
      }
      
      // If no structured format found, fall back to general threat extraction
      if (Object.keys(componentThreats).length === 0 && attackPaths.length === 0) {
        logger.warn('[THREAT-ANALYSIS] Structured format not found, using fallback extraction');
        
        // Use existing extraction patterns as fallback
        const severityPattern = /\d+\.\s*\[?(CRITICAL|HIGH|MEDIUM|LOW)\]?\s*(.+?)(?=\d+\.\s*\[?(?:CRITICAL|HIGH|MEDIUM|LOW)\]?|$)/gis;
        const matches = [...content.matchAll(severityPattern)];
        
        if (matches.length > 0) {
          // Put all threats in a general category
          componentThreats['general'] = matches.map((match, index) => ({
            id: `threat-${index}`,
            description: `[${match[1].toUpperCase()}] ${match[2].trim()}`,
            severity: match[1].toUpperCase(),
            riskScore: match[1] === 'CRITICAL' ? 10 : match[1] === 'HIGH' ? 8 : match[1] === 'MEDIUM' ? 5 : 3,
            type: 'threat'
          }));
        }
      }
    }
    
    // Count total threats
    const totalThreats = Object.values(componentThreats).reduce((sum, threats) => sum + threats.length, 0) +
                        attackPaths.length + vulnerabilities.length;
    
    // Debug logging for component threats mapping
    logger.info('[THREAT-ANALYSIS] Component threats breakdown:', {
      componentIds: Object.keys(componentThreats),
      threatCounts: Object.entries(componentThreats).map(([id, threats]) => ({
        componentId: id,
        threatCount: threats.length,
        isEdge: diagram.edges.some(e => e.id === id),
        isNode: diagram.nodes.some(n => n.id === id)
      }))
    });
    
    logger.info(`[THREAT-ANALYSIS] ========== COMPLETED REQUEST ${requestId} ==========`);
    logger.info('[THREAT-ANALYSIS] Analysis complete', {
      success: true,
      requestId,
      analysisId: sessionId,
      totalThreats,
      componentCount: Object.keys(componentThreats).length,
      attackPaths: attackPaths.length,
      vulnerabilities: vulnerabilities.length,
      recommendations: recommendations.length,
      metadata: result.metadata
    });
    
    // Clean up analysis session
    if (analysisId) {
      activeAnalyses.delete(analysisId);
      logger.info(`[THREAT-ANALYSIS] Cleaned up analysis session: ${analysisId}`);
    }
    
    res.json({ 
      success: true, 
      analysis: {
        systemAnalysis,
        componentThreats,
        attackPaths,
        vulnerabilities,
        recommendations,
        diagram: result.diagram, // Pass through the updated diagram with node-specific analysis
        metadata: result.metadata || {
          analysisType: analysisType,
          timestamp: new Date().toISOString()
        },
        // Keep backward compatibility
        content: result.content || '',
        threats: Object.values(componentThreats).flat() // Flattened list for legacy
      }
    });
  } catch (error) {
    logger.error('Threat analysis endpoint error:', error);
    
    // Clean up analysis session on error
    if (analysisId) {
      activeAnalyses.delete(analysisId);
      logger.info(`[THREAT-ANALYSIS] Cleaned up analysis session after error: ${analysisId}`);
    }
    
    logger.info(`[THREAT-ANALYSIS] ========== FAILED REQUEST ${requestId} ==========`);
    
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Internal error',
      errorType: error.name || 'UnknownError',
      details: process.env.NODE_ENV === 'development' ? {
        stack: error.stack,
        code: error.code
      } : undefined
    });
  }
});

// Chat endpoint
app.post('/api/chat', async (req, res) => {
  try {
    const { message, diagramId, provider, context } = req.body;
    
    // Extract data from context object if present
    const metadata = context?.metadata || req.body.metadata;
    const customContext = context?.customContext || req.body.customContext;
    const drawings = context?.drawings || req.body.drawings;
    const messageHistory = context?.messageHistory || req.body.messageHistory;
    const diagramFromContext = context?.diagram;
    const additionalContext = context?.additionalContext || req.body.additionalContext;
    
    // Extract chat web search settings from metadata
    const enableChatWebSearch = metadata?.enableChatWebSearch || false;
    const chatWebSearchConfig = metadata?.chatWebSearchConfig || null;
    
    // Extract analysis mode from metadata
    const analysisMode = metadata?.analysisMode || 'comprehensive';
    
    logger.info('\n=== Incoming Chat Request ===');
    logger.info('Chat request details:', {
      diagramId,
      provider,
      messageLength: message?.length,
      hasCustomContext: !!customContext,
      hasDrawings: !!drawings,
      messageHistoryLength: messageHistory?.length,
      hasDiagramInContext: !!diagramFromContext,
      analysisMode,
      metadata,
      hasAdditionalContext: !!additionalContext,
      additionalContextLength: additionalContext?.length,
      additionalContextPreview: additionalContext ? additionalContext.substring(0, 100) + '...' : null,
      timestamp: new Date().toISOString(),
      // DEBUG: Log context structure to understand the issue
      contextKeys: context ? Object.keys(context) : 'no context',
      contextDiagramExists: !!context?.diagram,
      contextDiagramNodeCount: context?.diagram?.nodes?.length || 0,
      contextDiagramEdgeCount: context?.diagram?.edges?.length || 0
    });

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const providerCheck = await ensureProviderInitializedForRequest(req, provider);
    if (!providerCheck.ok) {
      return res.status(providerCheck.status || 400).json({
        error: providerCheck.error || 'Provider Error',
        message: providerCheck.message || 'Unable to initialize AI provider',
        details: providerCheck.details
      });
    }
    
    // Verify that the current provider is properly initialized with an API key
    const currentProvider = aiManager.getCurrentProvider();
    if (!currentProvider) {
      return res.status(400).json({
        error: 'Configuration Error',
        message: 'No AI provider is currently configured',
        details: 'Please configure an AI provider in the settings panel before sending messages.'
      });
    }
    
    // Check if the provider is properly initialized
    try {
      await aiManager.testProvider(currentProvider);
    } catch (error) {
      logger.error(`Provider ${currentProvider} failed initialization test:`, error);
      return res.status(400).json({
        error: 'Provider Error',
        message: `The current provider (${currentProvider}) is not properly configured: ${error.message}`,
        details: 'Please check your API key in the settings panel and try again.'
      });
    }
    
    logger.info('Using AI provider:', aiManager.getCurrentProvider());

    // Automatic token-based context optimization
    const modelConfig = aiManager.getFullModelConfig();
    const modelInfo = modelConstants.getModelInfo(modelConfig.model || 'unknown');
    const tokenLimit = modelInfo?.maxTokens || 4096; // Default to 4k if unknown
    const currentModel = aiManager.getCurrentModel();
    
    // Warn if model has insufficient context window
    if (tokenLimit < 32768) {
      logger.warn(`Model ${modelConfig.model} has insufficient context window: ${tokenLimit} tokens (minimum recommended: 32768)`);
    }
    
    // Always use optimized context for all providers
    const includeFullContext = true; // smart-context flag deprecated – always include full context
    
    logger.info(`Context strategy: provider=${aiManager.getCurrentProvider()}, includeFullContext=${includeFullContext}`);
    
    // Load diagram from context, diagramId, or directly from request
    let diagram = diagramFromContext || req.body.diagram || null;
    let threatIntel = null;
    
    // If no diagram in context but diagramId is provided, load from file
    if (!diagram && diagramId) {
      try {
        const safeId = sanitizeDiagramId(diagramId);
        if (!safeId) throw new Error('Invalid diagram ID');
        const diagramPath = safePath(DIAGRAMS_DIR, `${safeId}.json`);
        const diagramData = await fs.promises.readFile(diagramPath, 'utf8');
        diagram = JSON.parse(diagramData);
        logger.info(`Loaded diagram ${diagramId}`);
      } catch (error) {
        logger.error(`Error loading diagram ${diagramId}:`, error);
        return res.status(404).json({ error: 'Diagram not found' });
      }
    }
    
    // Log diagram data for debugging
    if (diagram) {
      logger.info('Diagram data found:', {
        nodes: diagram.nodes?.length || 0,
        edges: diagram.edges?.length || 0,
        hasMetadata: !!diagram.metadata,
        hasCustomContext: !!diagram.customContext
      });
    } else {
      logger.info('No diagram data available');
    }

    // Try to load threat intelligence data if diagram exists
    if (diagram && diagram.nodes && diagram.nodes.length > 0) {
      try {
        // If diagramId is provided, try to load cached threat intel
        if (diagramId) {
          try {
            const safeId = sanitizeDiagramId(diagramId);
            if (!safeId) throw new Error('Invalid diagram ID for threat intelligence lookup');
            const threatIntelPath = safePath(THREAT_INTEL_DIR, `${safeId}.json`);
            const threatIntelData = await fs.promises.readFile(threatIntelPath, 'utf8');
            threatIntel = JSON.parse(threatIntelData);
            logger.info(`Loaded threat intelligence data for diagram ${diagramId}`);
          } catch (error) {
            logger.info(`No cached threat intelligence data found for diagram ${diagramId}`);
          }
        }
        
        // Legacy threat intelligence service removed
        logger.info('Legacy threat intelligence service has been removed - use LangExtract integration');
      } catch (error) {
        logger.error('Error analyzing threat intelligence:', error);
        logger.error(error.stack);
      }
    }

    // Create context object with metadata
    const analysisContext = {
      analysisMode: analysisMode,
      metadata
    };
    
    logger.info(`Analysis using ${analysisMode} methodology`);

    // Format the prompt using the improved formatter with complete context
    let formattedPrompt;
    let detailContextUsed = false; // Declare at the outer scope
    try {
      // Always use the same formatter regardless of includeFullContext
      formattedPrompt = formatters.formatPromptForProvider({
        diagram,
        threatIntel,
        context: {
          ...analysisContext,
          customContext,
          drawings,
          messageHistory,
          metadata,
          previousDiagram: context?.previousDiagram,
          diagramChanges: context?.diagramChanges,
          additionalContext: additionalContext,
          isChatEndpoint: true, // Flag to indicate this is from chat endpoint
          isLocalLLM: isLocalProvider(provider, currentModel), // Pass local LLM flag for proper ordering
          model: currentModel // Pass current model name
        },
        message
      });
      detailContextUsed = false;
    } catch (promptError) {
      // Handle model configuration errors specifically
      if (promptError.message && promptError.message.includes('Model configuration error:')) {
        logger.error('Model configuration error detected:', promptError.message);
        return res.status(400).json({
          error: 'Model Configuration Error',
          message: promptError.message.replace('Model configuration error: ', ''),
          details: 'Please check your local LLM settings.'
        });
      }
      // For other errors, log and return error
      logger.error('Error formatting prompt:', promptError);
      return res.status(500).json({
        error: 'Internal server error',
        message: 'Error preparing context for AI'
      });
    }

    logger.info(`Using analysis mode: ${analysisContext.analysisMode}`);

    // Log the prompt length for debugging
    logger.info(`Formatted prompt length: ${formattedPrompt.length} characters`);
    logger.info(`Using analysis mode: ${analysisContext.analysisMode}`);

    // Check if the prompt contains the expected context
    if (formattedPrompt.includes('CREATE (') && formattedPrompt.includes('SecurityNode')) {
      logger.info('✅ Formatted prompt DOES contain Cypher diagram context');
    } else {
      logger.error('❌ Formatted prompt MISSING Cypher diagram context');
      logger.error('First 500 chars of prompt:', formattedPrompt.substring(0, 500));
    }
    
    logger.info(`Using analysis mode: ${analysisContext.analysisMode}`);

    // Generate the response
    logger.info('=== Preparing AI Request ===', {
      messageCount: 2,
      systemPrompt: formattedPrompt.substring(0, 100) + '...',
      diagramData: diagram ? `defined with ${diagram.nodes?.length || 0} nodes` : 'undefined...',
      hasCustomContext: !!customContext,
      hasThreatIntel: !!threatIntel
    });

    // Check if AI provider is configured
    if (!aiManager || !aiManager.getCurrentProvider()) {
      logger.warn('[CHAT] No AI provider configured');
      return res.status(503).json({ 
        error: 'No AI provider configured. Please configure an AI provider (e.g., Ollama, OpenAI, Anthropic) in the settings.',
        providerStatus: 'not_configured'
      });
    }

    // Build the messages array with proper conversation history
    const messages = [];
    
    // Add system prompt
    messages.push({ 
      role: 'system', 
      content: formattedPrompt
    });
    
    // Add conversation history if available
    if (context?.messageHistory && context.messageHistory.length > 0) {
      // Calculate optimal message history based on available tokens
      const estimateTokens = (text) => Math.ceil((text || '').length / 3.5);
      const totalContextTokens = estimateTokens(formattedPrompt) + 
        (context.diagram ? estimateTokens(JSON.stringify(context.diagram)) : 0) +
        (context.customContext ? estimateTokens(context.customContext.content) : 0);
      
      // Reserve tokens for response and use remaining for message history
      const modelMaxTokens = tokenLimit;
      const availableForHistory = Math.max(500, (modelMaxTokens * 0.85) - totalContextTokens);
      
      let usedTokens = 0;
      let messageCount = 0;
      
      // Calculate backwards from most recent messages
      for (let i = context.messageHistory.length - 1; i >= 0; i--) {
        const messageTokens = estimateTokens(context.messageHistory[i].content);
        if (usedTokens + messageTokens <= availableForHistory) {
          usedTokens += messageTokens;
          messageCount++;
        } else {
          break;
        }
      }
      
      // Ensure minimum context (at least 2 messages for continuity)
      const finalCount = Math.max(2, Math.min(messageCount, context.messageHistory.length));
      const recentHistory = context.messageHistory.slice(-finalCount);
      
      recentHistory.forEach(msg => {
        // Convert client format to OpenAI format
        let role = 'user';
        if (msg.role === 'assistant' || msg.type === 'response' || msg.type === 'analysis' || msg.type === 'assistant') {
          role = 'assistant';
        } else if (msg.role === 'user' || msg.type === 'question' || msg.type === 'user') {
          role = 'user';
        }
        
        // Ensure content is a string
        let content = msg.content;
        if (typeof content === 'object' && content !== null) {
          // If content is an object, try to extract the text
          content = content.text || content.message || JSON.stringify(content);
        }
        
        messages.push({
          role: role,
          content: String(content) // Ensure it's always a string
        });
      });
    }
    
    // Add the current user message - ensure it's a string
    let userMessage = message;
    if (typeof userMessage === 'object' && userMessage !== null) {
      userMessage = userMessage.text || userMessage.content || JSON.stringify(userMessage);
    }
    
    // Apply model-specific chat context reinforcement
    userMessage = applyChatContextReinforcement(userMessage, provider, currentModel, context);
    
    messages.push({ 
      role: 'user', 
      content: String(userMessage || '') 
    });
    
    logger.info(`Sending ${messages.length} messages to AI provider (including ${messages.length - 2} history messages)`);
    
    // Debug: Log all messages being sent
    logger.info('\n=== MESSAGES BEING SENT TO AI ===');
    messages.forEach((msg, index) => {
      logger.info(`Message ${index + 1} (${msg.role}):`);
      logger.info(`Content: ${msg.content.substring(0, 200)}...`);
      logger.info(`Full length: ${msg.content.length} characters`);
    });
    logger.info('=== END MESSAGES ===\n');
    
    // Only pass maxTokens for local providers
    const chatRequestOptions = {
      temperature: aiManager.localLLMConfig?.temperature
    };
    
    if (aiManager.getCurrentProvider() === 'local') {
      chatRequestOptions.maxTokens = aiManager.localLLMConfig?.maxTokens;
    }
    
    // Add web search options if enabled
    if (enableChatWebSearch) {
      chatRequestOptions.enableWebSearch = true;
      chatRequestOptions.webSearchConfig = chatWebSearchConfig;
    }
    
    const response = await aiManager.generateResponse(messages, chatRequestOptions);

    logger.info('\n=== AI MANAGER RESPONSE ===');
    logger.info('Response from aiManager:', JSON.stringify(response, null, 2));
    logger.info('Response keys:', Object.keys(response || {}));
    logger.info('Provider:', aiManager.getCurrentProvider());
    logger.info('=== END AI MANAGER RESPONSE ===\n');

    // Format and send response
    const formattedResponse = formatters.formatAIResponse(response, aiManager.getCurrentProvider(), aiManager.getCurrentModel(), { message: message });
    
    // Include smartContext flag for metadata
    formattedResponse.metadata.smartContextUsed = includeFullContext;
    formattedResponse.metadata.detailContextUsed = detailContextUsed || false;
    
    // Add context window warning if below recommended minimum
    if (tokenLimit < 32768) {
      formattedResponse.metadata.contextWindowWarning = `Model has ${tokenLimit} token context window, below recommended 32k minimum`;
      formattedResponse.metadata.contextWindowSize = tokenLimit;
    }
    
    logger.info('\n=== FORMATTED RESPONSE FOR CLIENT ===');
    logger.info('Formatted response:', JSON.stringify(formattedResponse, null, 2));
    logger.info('=== END FORMATTED RESPONSE ===\n');
    
    res.json(formattedResponse);
  } catch (error) {
    logger.error('Chat API Error:', {
      error: error.message,
      type: error.constructor.name,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Store active requests globally for cancellation
const activeRequests = new Map();

// Streaming chat endpoint
app.post('/api/chat/stream', async (req, res) => {
  const requestId = req.body.requestId || Date.now().toString();
  
  // Guard: if the connection was somehow closed very early, bail out
  if (res.writableEnded || res.destroyed) return res.end();

  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable Nginx buffering

  // Declare variables at the outer scope so they're accessible in catch block
  let connectionClosed = false;
  let performCleanup;

  try {
    const { message, diagramId, provider, context } = req.body;
    
    // Extract data from context object if present
    const metadata = context?.metadata || req.body.metadata;
    const customContext = context?.customContext || req.body.customContext;
    const drawings = context?.drawings || req.body.drawings;
    const messageHistory = context?.messageHistory || req.body.messageHistory;
    const diagramFromContext = context?.diagram;
    const additionalContext = context?.additionalContext || req.body.additionalContext;
    
    // Extract chat web search settings from metadata
    const enableChatWebSearch = metadata?.enableChatWebSearch || false;
    const chatWebSearchConfig = metadata?.chatWebSearchConfig || null;
    
    // Extract analysis mode from metadata
    const analysisMode = metadata?.analysisMode || 'comprehensive';
    
    logger.info('\n=== Incoming Streaming Chat Request ===');
    logger.info('Streaming chat request details:', {
      requestId,
      diagramId,
      provider,
      messageLength: message?.length,
      hasCustomContext: !!customContext,
      hasDrawings: !!drawings,
      messageHistoryLength: messageHistory?.length,
      hasDiagramInContext: !!diagramFromContext,
      analysisMode,
      metadata,
      timestamp: new Date().toISOString()
    });

    if (!message) {
      sendErrorEvent(res, 'Message is required', 400);
      return res.end();
    }

    const providerCheck = await ensureProviderInitializedForRequest(req, provider);
    if (!providerCheck.ok) {
      sendErrorEvent(res, providerCheck.message || 'Unable to initialize AI provider', providerCheck.status || 400);
      return res.end();
    }
    
    // Verify that the current provider is properly initialized with an API key
    const currentProvider = aiManager.getCurrentProvider();
    if (!currentProvider) {
      sendErrorEvent(res, 'No AI provider is currently configured', 400);
      return res.end();
    }
    
    // Get current model for later use
    const currentModel = aiManager.getCurrentModel();
    
    // Check if the provider is properly initialized
    try {
      await aiManager.testProvider(currentProvider);
    } catch (error) {
      logger.error(`Provider ${currentProvider} failed initialization test:`, error);
      sendErrorEvent(res, `The current provider (${currentProvider}) is not properly configured: ${error.message}`, 400);
      return res.end();
    }
    
    logger.info('Using AI provider for streaming:', aiManager.getCurrentProvider());

    // Automatic token-based context optimization
    const modelConfig = aiManager.getFullModelConfig();
    const modelInfo = modelConstants.getModelInfo(modelConfig.model || 'unknown');
    const tokenLimit = modelInfo?.maxTokens || 4096; // Default to 4k if unknown
    
    // Warn if model has insufficient context window
    if (tokenLimit < 32768) {
      logger.warn(`Model ${modelConfig.model} has insufficient context window: ${tokenLimit} tokens (minimum recommended: 32768)`);
    }
    
    // Always use optimized context for all providers
    const includeFullContext = true; // smart-context flag deprecated – always include full context
    
    logger.info(`Context strategy: provider=${aiManager.getCurrentProvider()}, includeFullContext=${includeFullContext}`);
    
    // Load diagram from context, diagramId, or directly from request
    let diagram = diagramFromContext || req.body.diagram || null;
    let threatIntel = null;
    
    // If no diagram in context but diagramId is provided, load from file
    if (!diagram && diagramId) {
      try {
        const safeId = sanitizeDiagramId(diagramId);
        if (!safeId) throw new Error('Invalid diagram ID');
        const diagramPath = safePath(DIAGRAMS_DIR, `${safeId}.json`);
        const diagramData = await fs.promises.readFile(diagramPath, 'utf8');
        diagram = JSON.parse(diagramData);
        logger.info(`Loaded diagram ${diagramId}`);
      } catch (error) {
        logger.error(`Error loading diagram ${diagramId}:`, error);
        sendErrorEvent(res, 'Diagram not found', 404);
        return res.end();
      }
    }
    
    // Try to load threat intelligence data if diagram exists
    if (diagram && diagram.nodes && diagram.nodes.length > 0) {
      try {
        // If diagramId is provided, try to load cached threat intel
        if (diagramId) {
          try {
            const safeId = sanitizeDiagramId(diagramId);
            if (!safeId) throw new Error('Invalid diagram ID for threat intelligence lookup');
            const threatIntelPath = safePath(THREAT_INTEL_DIR, `${safeId}.json`);
            const threatIntelData = await fs.promises.readFile(threatIntelPath, 'utf8');
            threatIntel = JSON.parse(threatIntelData);
            logger.info(`Loaded threat intelligence data for diagram ${diagramId}`);
          } catch (error) {
            logger.info(`No cached threat intelligence data found for diagram ${diagramId}`);
          }
        }
        
        // Legacy threat intelligence service removed
        logger.info('Legacy threat intelligence service has been removed - use LangExtract integration');
      } catch (error) {
        logger.error('Error analyzing threat intelligence:', error);
        logger.error(error.stack);
      }
    }

    // Create context object with metadata
    const analysisContext = {
      analysisMode: analysisMode,
      metadata
    };
    
    logger.info(`Analysis using ${analysisMode} methodology`);

    // Format the prompt using the improved formatter with complete context
    let formattedPrompt;
    let detailContextUsedStream = false; // Initialize to false
    
    try {
      // Always use the same formatter regardless of includeFullContext
      formattedPrompt = formatters.formatPromptForProvider({
        diagram,
        threatIntel,
        context: {
          ...analysisContext,
          customContext,
          drawings,
          messageHistory,
          metadata,
          previousDiagram: context?.previousDiagram,
          diagramChanges: context?.diagramChanges,
          additionalContext: additionalContext,
          isChatEndpoint: true, // Flag to indicate this is from streaming chat endpoint
          isLocalLLM: isLocalProvider(provider, currentModel), // Pass local LLM flag for proper ordering
          model: currentModel // Pass current model name
        },
        message
      });
      detailContextUsedStream = false;
    } catch (promptError) {
      // Handle model configuration errors specifically
      if (promptError.message && promptError.message.includes('Model configuration error:')) {
        logger.error('Model configuration error detected:', promptError.message);
        sendErrorEvent(res, promptError.message, 400);
        return res.end();
      }
      // For other errors, log and continue with a fallback
      logger.error('Error formatting prompt:', promptError);
      sendErrorEvent(res, 'Error preparing context for AI', 500);
      return res.end();
    }

    logger.info(`Using analysis mode: ${analysisContext.analysisMode}`);

    // Log the prompt length for debugging
    logger.info(`Formatted prompt length: ${formattedPrompt.length} characters`);
    logger.info(`Using analysis mode: ${analysisContext.analysisMode}`);

    // Create an AbortController for this request
    const controller = new AbortController();
    activeRequests.set(requestId, controller);
    
    // Track cleanup state to prevent double cleanup
    let cleanupPerformed = false;
    connectionClosed = false; // Reset the outer variable
    
    performCleanup = (reason) => {
      if (cleanupPerformed) {
        logger.debug(`Cleanup already performed for request ${requestId}, skipping (reason: ${reason})`);
        return;
      }
      
      cleanupPerformed = true;
      connectionClosed = true;
      logger.info(`Performing cleanup for request ${requestId} (reason: ${reason})`);
      
      // Abort the controller if it exists
      if (controller && !controller.signal.aborted) {
        try {
          controller.abort();
        } catch (e) {
          logger.debug(`Error aborting controller for ${requestId}:`, e.message);
        }
      }
      
      // Remove from active requests
      if (activeRequests.has(requestId)) {
        activeRequests.delete(requestId);
      }
      
      // End the response if needed
      if (!res.writableEnded && !res.destroyed) {
        try { 
          res.end();
          logger.debug(`Response ended for request ${requestId}`);
        } catch (e) {
          logger.debug(`Error ending response for ${requestId}:`, e.message);
        }
      }
    };

    // Single handler for client disconnect
    res.on('close', () => {
      logger.info(`Client disconnected for request ${requestId}`);
      performCleanup('client_disconnect');
    });
    
    // Handle response errors
    res.on('error', (err) => {
      logger.error(`Response stream error for request ${requestId}:`, err);
      performCleanup('response_error');
    });

    // Send initial event to confirm connection
    safeWrite(res, `event: start\ndata: ${JSON.stringify({ requestId })}\n\n`);

    // Check if AI provider is configured
    if (!aiManager || !aiManager.getCurrentProvider()) {
      logger.warn('[CHAT-STREAM] No AI provider configured');
      const errorMessage = 'No AI provider configured. Please configure an AI provider (e.g., Ollama, OpenAI, Anthropic) in the settings.';
      safeWrite(res, `event: error\ndata: ${JSON.stringify({ error: errorMessage, providerStatus: 'not_configured' })}\n\n`);
      res.end();
      return;
    }

    // Send meta info for context optimization status
    safeWrite(res, `data: ${JSON.stringify({ meta: { smartContextUsed: includeFullContext, detailContextUsed: detailContextUsedStream || false } })}\n\n`);

    // Build the messages array with proper conversation history
    const messages = [];
    
    // Add system prompt
    messages.push({ 
      role: 'system', 
      content: formattedPrompt
    });
    
    // Add conversation history if available
    if (context?.messageHistory && context.messageHistory.length > 0) {
      // Calculate optimal message history based on available tokens
      const estimateTokens = (text) => Math.ceil((text || '').length / 3.5);
      const totalContextTokens = estimateTokens(formattedPrompt) + 
        (context.diagram ? estimateTokens(JSON.stringify(context.diagram)) : 0) +
        (context.customContext ? estimateTokens(context.customContext.content) : 0);
      
      // Reserve tokens for response and use remaining for message history
      const modelMaxTokens = tokenLimit;
      const availableForHistory = Math.max(500, (modelMaxTokens * 0.85) - totalContextTokens);
      
      let usedTokens = 0;
      let messageCount = 0;
      
      // Calculate backwards from most recent messages
      for (let i = context.messageHistory.length - 1; i >= 0; i--) {
        const messageTokens = estimateTokens(context.messageHistory[i].content);
        if (usedTokens + messageTokens <= availableForHistory) {
          usedTokens += messageTokens;
          messageCount++;
        } else {
          break;
        }
      }
      
      // Ensure minimum context (at least 2 messages for continuity)
      const finalCount = Math.max(2, Math.min(messageCount, context.messageHistory.length));
      const recentHistory = context.messageHistory.slice(-finalCount);
      
      recentHistory.forEach(msg => {
        // Convert client format to OpenAI format
        let role = 'user';
        if (msg.role === 'assistant' || msg.type === 'response' || msg.type === 'analysis' || msg.type === 'assistant') {
          role = 'assistant';
        } else if (msg.role === 'user' || msg.type === 'question' || msg.type === 'user') {
          role = 'user';
        }
        
        // Ensure content is a string
        let content = msg.content;
        if (typeof content === 'object' && content !== null) {
          // If content is an object, try to extract the text
          content = content.text || content.message || JSON.stringify(content);
        }
        
        messages.push({
          role: role,
          content: String(content) // Ensure it's always a string
        });
      });
    }
    
    // Add the current user message - ensure it's a string
    let userMessage = message;
    if (typeof userMessage === 'object' && userMessage !== null) {
      userMessage = userMessage.text || userMessage.content || JSON.stringify(userMessage);
    }
    
    
    // Apply model-specific chat context reinforcement
    userMessage = applyChatContextReinforcement(userMessage, provider, currentModel, context);
    
    messages.push({ 
      role: 'user', 
      content: String(userMessage || '') 
    });
    
    logger.info(`Streaming ${messages.length} messages to AI provider (including ${messages.length - 2} history messages)`);

    // Stream the response
    try {
      // Build options for streaming
      const streamOptions = {
        temperature: aiManager.localLLMConfig?.temperature,
        maxTokens: aiManager.localLLMConfig?.maxTokens
      };
      
      // Add web search options if enabled
      if (enableChatWebSearch) {
        streamOptions.enableWebSearch = true;
        streamOptions.webSearchConfig = chatWebSearchConfig;
      }
      
      await aiManager.streamResponse(
        messages,
        {
          ...streamOptions,
          onToken: (token) => {
            // Check if connection is still open before writing
            if (!connectionClosed && !res.writableEnded) {
              try {
                // Check if this is a status update
                if (token.startsWith('[STATUS:') && token.endsWith(']')) {
                  const status = token.slice(8, -1); // Extract status between [STATUS: and ]
                  let statusMessage = '';
                  
                  switch (status) {
                    case 'CONNECTING_OLLAMA':
                      statusMessage = 'Connecting to Ollama...';
                      break;
                    case 'WAITING_FOR_MODEL':
                      statusMessage = 'Waiting for model to respond... This may take a moment for complex prompts.';
                      break;
                    case 'MODEL_RESPONDING':
                      statusMessage = 'Model is generating response...';
                      break;
                    case 'TIMEOUT':
                      statusMessage = 'Request timed out. The model may be overloaded.';
                      break;
                    case 'ERROR':
                      statusMessage = 'An error occurred while connecting to the model.';
                      break;
                    default:
                      statusMessage = status;
                  }
                  
                  // Send status as a special event
                  const success = safeWrite(
                    res,
                    `event: status\ndata: ${JSON.stringify({ status: status, message: statusMessage })}\n\n`
                  );
                  if (!success) {
                    logger.warn(`Write buffer full for status update ${requestId}`);
                  }
                } else {
                  // Send regular token
                  const success = safeWrite(
                    res,
                    `event: token\ndata: ${JSON.stringify({ token })}\n\n`
                  );
                  if (!success) {
                    logger.warn(`Write buffer full for request ${requestId}`);
                  }
                }
              } catch (writeError) {
                logger.error(`Error writing token for request ${requestId}:`, writeError);
                connectionClosed = true;
              }
            }
          },
          onComplete: (fullResponse) => {
            if (!connectionClosed && !res.writableEnded && !cleanupPerformed) {
              try {
                // Send the complete response as a final event
                const formattedResponse = formatters.formatAIResponse(fullResponse, aiManager.getCurrentProvider(), aiManager.getCurrentModel(), { message: message });
                formattedResponse.metadata.smartContextUsed = includeFullContext;
                formattedResponse.metadata.detailContextUsed = detailContextUsedStream || false;
                const writeSuccess = safeWrite(
                  res,
                  `event: complete\ndata: ${JSON.stringify(formattedResponse)}\n\n`
                );
                
                if (writeSuccess) {
                  logger.info(`Successfully sent completion event for request ${requestId}`);
                }
                
                // Perform cleanup after successful completion
                performCleanup('stream_complete');
                
              } catch (writeError) {
                logger.error(`Error writing completion for request ${requestId}:`, writeError);
                performCleanup('completion_write_error');
              }
            } else {
              logger.warn(`Connection already closed for request ${requestId}, skipping completion write`);
              performCleanup('connection_closed_before_complete');
            }
          },
          signal: controller.signal
        }
      );
    } catch (error) {
      if (!cleanupPerformed) {
        if (error.name === 'AbortError' || error.message === 'Request was cancelled' || error.message?.includes('cancel')) {
          logger.info(`Request ${requestId} was cancelled by the user`);
          if (!connectionClosed) {
            sendErrorEvent(res, 'Request cancelled by user', 499);
          }
        } else {
          logger.error('Streaming Error:', {
            message: error.message,
            name: error.name,
            requestId: requestId,
            provider: aiManager.getCurrentProvider()
          });
          if (!connectionClosed) {
            sendErrorEvent(res, error.message, 500);
          }
        }
        
        // Perform cleanup
        performCleanup('stream_error');
      }
    }
  } catch (error) {
    logger.error('Streaming Chat API Error:', {
      error: error.message,
      type: error.constructor.name,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    
    if (!connectionClosed && !res.writableEnded) {
      sendErrorEvent(res, error.message, 500);
    }
    
    // Ensure cleanup is performed
    if (typeof performCleanup === 'function') {
      performCleanup('api_error');
    } else {
      // Fallback cleanup if performCleanup is not defined (shouldn't happen)
      if (!res.writableEnded && !res.destroyed) {
        try { res.end(); } catch (_) {/* ignore */}
      }
    }
  }
});

// Endpoint to cancel an ongoing streaming request
app.post('/api/chat/cancel', (req, res) => {
  const { requestId } = req.body;
  
  if (!requestId) {
    return res.status(400).json({ error: 'Request ID is required' });
  }
  
  const controller = activeRequests.get(requestId);
  if (controller) {
    controller.abort();
    activeRequests.delete(requestId);
    logger.info(`Request ${requestId} cancelled by user`);
    return res.json({ success: true, message: 'Request cancelled' });
  } else {
    logger.info(`Request ${requestId} not found or already completed`);
    return res.status(404).json({ error: 'Request not found or already completed' });
  }
});

// Endpoint to cancel diagram generation
app.post('/api/generate-diagram/cancel', (req, res) => {
  const { requestId } = req.body;
  
  if (!requestId) {
    return res.status(400).json({ error: 'Request ID is required' });
  }
  
  const controller = activeRequests.get(requestId);
  if (controller) {
    controller.abort();
    activeRequests.delete(requestId);
    logger.info(`Diagram generation ${requestId} cancelled by user`);
    return res.json({ success: true, message: 'Diagram generation cancelled' });
  } else {
    logger.info(`Diagram generation ${requestId} not found or already completed`);
    return res.status(404).json({ error: 'Request not found or already completed' });
  }
});

// Helper function to send error events
function sendErrorEvent(res, message, statusCode) {
  safeWrite(
    res,
    `event: error\ndata: ${JSON.stringify({ error: message, status: statusCode })}\n\n`
  );
}


// Legacy threat intelligence endpoints removed - use LangExtract integration



// Note: Error handling is already consolidated in the single error handler above
// These duplicate handlers have been removed to avoid conflicts

// Port finding is now handled by port-manager.js

// Graceful shutdown function
const gracefulShutdown = async (server) => {
    logger.info('Starting graceful shutdown...');
    
    // Remove port file (skip on Vercel)
    if (!process.env.IS_VERCEL && !process.env.VERCEL) {
        removePortFile();
    }
    
    // Close server
    if (server) {
        await new Promise((resolve) => {
            server.close(() => {
                logger.info('HTTP server closed');
                resolve();
            });
        });
    }
    
    // Close database connections, cleanup resources, etc.
    logger.info('Cleanup complete');
    process.exit(0);
};

// Server restart function
const restartServer = async () => {
    logger.info('Server restart requested...');
    
    if (global.serverInstance) {
        // Close existing server
        await new Promise((resolve) => {
            global.serverInstance.close(() => {
                logger.info('Existing server closed');
                resolve();
            });
        });
    }
    
    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Start new server
    try {
        const newServer = await startServer();
        global.serverInstance = newServer;
        logger.info('Server restarted successfully');
        return true;
    } catch (error) {
        logger.error('Failed to restart server:', error);
        return false;
    }
};

// Server initialization
const startServer = async () => {
    try {
        // Initialize all services at once
        await initializeServices();

        // Set aiManager in Express app context so routes can access it
        app.set('aiManager', aiManager);

        if (cloudDiscoveryEnabled) {
            const cloudDiscoveryRoutes = require('./routes/cloudDiscoveryRoutes');
            app.use('/api/cloud', cloudDiscoveryRoutes);
            logger.info('Cloud discovery routes registered at /api/cloud');
        } else {
            logger.info('Cloud discovery routes disabled via ENABLE_CLOUD_DISCOVERY flag');
        }

        const preferredPort = parseInt(process.env.PORT || '3001', 10);
        const port = await findAvailablePort(preferredPort);
        
        // Get server configuration
        const config = security.getServerConfig();
        const host = config.host;
        
        const server = app.listen(port, host, () => {
            // Set server timeouts to handle longest possible request (diagram generation)
            const maxTimeout = 720000; // 12 minutes for diagram generation
            server.keepAliveTimeout = maxTimeout + 1000;
            server.headersTimeout = maxTimeout + 2000;
            
            logger.info('\nServer Configuration:');
            logger.info('-'.repeat(50));
            logger.info(`Server running on ${host}:${port}`);
            logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
            logger.info(`http://localhost:${port}`);
            
            // Log security warnings
            security.logSecurityWarnings(config, port);
            
            // Store the port for other parts of the application
            process.env.ACTUAL_PORT = port.toString();
            
            // Write port file for Tauri and frontend (skip on Vercel)
            if (!process.env.IS_VERCEL && !process.env.VERCEL) {
                writePortFile(port);
            }

            // Optional browser auto-open for npm/global CLI usage
            if (
                process.env.AUTO_OPEN_BROWSER === 'true' &&
                !process.env.IS_VERCEL &&
                !process.env.VERCEL &&
                !process.env.TAURI &&
                !browserOpenedForSession
            ) {
                const appUrl = `http://localhost:${port}`;
                browserOpenedForSession = true;
                logger.info(`AUTO_OPEN_BROWSER enabled, opening ${appUrl}`);
                setTimeout(() => {
                    try {
                        openBrowser(appUrl);
                    } catch (error) {
                        logger.warn('Failed to auto-open browser:', error.message);
                    }
                }, 500);
            }
        });

        // Error handling
        server.on('error', (error) => {
            logger.error('Server error:', error);
            if (error.code === 'EADDRINUSE') {
                logger.error(`Port ${port} is already in use`);
                logger.info('Another instance of the server may already be running');
                logger.info('This is normal for Tauri apps - the first instance will handle requests');
                // Don't exit the process - just log the error
                return;
            }
            process.exit(1);
        });
        
        // Store server instance globally for restart
        global.serverInstance = server;
        
        // Cleanup on shutdown
        process.on('SIGINT', () => {
            logger.info('Server shutting down (SIGINT)...');
            gracefulShutdown(server);
        });
        
        process.on('SIGTERM', () => {
            logger.info('Server shutting down (SIGTERM)...');
            gracefulShutdown(server);
        });

        return server;
    } catch (error) {
        logger.error('Failed to start server:', error);
        if (error.message && error.message.includes('Server already running')) {
            logger.info('Server is already running, exiting gracefully');
            process.exit(0);
        }
        process.exit(1);
    }
};

// System tray support for browser-based architecture
let trayManager = null;

const initializeSystemTray = (server, port) => {
    // Only initialize system tray on Windows when not running in Tauri
    if (process.platform === 'win32' && !process.env.TAURI) {
        try {
            // Try Electron-based tray first (if running with Electron)
            if (process.versions.electron) {
                const { SystemTrayManager } = require('./system-tray');
                trayManager = new SystemTrayManager(server, port);
                logger.info('System tray initialized with Electron');
            } else {
                // Fallback to simple systray2
                const { SimpleTrayManager } = require('./system-tray');
                trayManager = new SimpleTrayManager(server, port);
                logger.info('System tray initialized with systray2');
            }
        } catch (error) {
            logger.warn('Could not initialize system tray:', error.message);
            logger.info('Server will run without system tray support');
        }
    }
};

// Start the server with optional system tray
const startServerWithTray = async () => {
    const server = await startServer();
    if (server) {
        const port = process.env.ACTUAL_PORT || 3001;
        initializeSystemTray(server, port);
        
        // Handle server restart requests from tray
        server.on('restart-requested', async () => {
            const success = await restartServer();
            if (success && trayManager && trayManager.showBalloon) {
                trayManager.showBalloon('Server Restarted', 'ContextCypher server has been restarted successfully');
            }
        });
    }
    return server;
};

// Start the server
if (require.main === module) {
    startServerWithTray();
}

//settings API endpoints
app.post('/api/settings/ai-provider', async (req, res) => {
  const timestamp = new Date().toISOString();
  const requestId = req.requestId || 'unknown';
  
  try {
      // Ensure AI services are ready in serverless cold starts
      await initializeServices();
      if (!aiManager) {
          return res.status(503).json({
              error: 'AI services not ready',
              message: 'AI provider manager failed to initialize'
          });
      }

      const { provider, apiKey, baseUrl, model, temperature, maxTokens, organizationId, projectId, testOnly } = req.body;
      
      logger.info(`[${timestamp}] [${requestId}] === PROVIDER CHANGE REQUEST ===`);
      logger.info(`[${timestamp}] [${requestId}] Request headers:`, {
          'x-app-secret': req.headers['x-app-secret'] ? '[PRESENT]' : '[MISSING]',
          'origin': req.headers.origin,
          'content-type': req.headers['content-type']
      });
      logger.info(`[${timestamp}] [${requestId}] Received provider change request:`, {
          provider,
          hasApiKey: !!apiKey,
          hasOrgId: !!organizationId,
          hasProjectId: !!projectId,
          hasBaseUrl: !!baseUrl,
          hasModel: !!model,
          temperature,
          maxTokens,
          testOnly: !!testOnly
      });
      logger.info(`[${timestamp}] [${requestId}] Full request body:`, req.body);
      logger.info(`[${timestamp}] [${requestId}] === END PROVIDER CHANGE REQUEST ===\n`);
      
      // Store current provider for logging purposes
      const currentProvider = aiManager.getCurrentProvider();

      // Validate provider
      if (!['openai', 'anthropic', 'gemini', 'local'].includes(provider)) {
          return res.status(400).json({
              error: 'Invalid provider specified'
          });
      }

      // Special handling for test-only mode
      if (testOnly) {
          logger.info('TEST-ONLY MODE: Testing provider without affecting current configuration');
          
          try {
              // Create a temporary AI manager instance for testing
              const testConfig = {
                  apiKey: null,
                  organizationId: organizationId || null,
                  projectId: projectId || null,
                  baseUrl,
                  model: model,
                  temperature,
                  maxTokens
              };
              
              // Handle provider-specific configuration
              if (provider === 'local') {
                  const baseUrlValidation = validateOllamaBaseUrl(baseUrl);
                  if (!baseUrlValidation.valid) {
                      throw new Error(baseUrlValidation.error);
                  }
                  testConfig.model = model;
                  testConfig.temperature = temperature || 0.2;
                  testConfig.maxTokens = maxTokens || 4096;
                  // Add GPU configuration from request body
                  testConfig.gpuMemoryFraction = req.body.gpuMemoryFraction || 0.9;
                  testConfig.numThreads = req.body.numThreads || 0;
                  testConfig.batchSize = req.body.batchSize || 512;
                  // Advanced GPU settings
                  testConfig.gpuOverhead = req.body.gpuOverhead || 1024;
                  testConfig.numParallel = req.body.numParallel || 1;
                  testConfig.maxLoadedModels = req.body.maxLoadedModels || 1;
                  testConfig.keepAlive = req.body.keepAlive || '5m';
                  testConfig.gpuLayers = req.body.gpuLayers ?? -1;
                  testConfig.selectedGPU = req.body.selectedGPU || 'auto';
              } else {
                  testConfig.apiKey = apiKey || getAPIKey(provider, req);
                  if (!testConfig.apiKey) {
                      throw new Error(`No API key provided for ${provider}`);
                  }
              }
              
              // Create temporary manager for testing
              const AIProviderManager = require('./aiProviders');
              const testManager = new AIProviderManager();
              
              // Initialize and test the provider
              await testManager.initializeProvider(provider, testConfig, false); // false = don't skip test
              
              // Call the enhanced testProvider method to get detailed results
              const testResult = await testManager.testProvider(provider);
              
              if (testResult.success) {
                  logger.info('TEST-ONLY MODE: Test successful');
                  
                  res.json({
                      success: true,
                      message: testResult.message,
                      testOnly: true,
                      currentProvider: null, // No active provider when just testing
                      tokenLimits: testManager.tokenLimits[provider] || {}
                  });
              } else {
                  logger.error('TEST-ONLY MODE: Test failed:', testResult.message);
                  res.status(400).json({
                      success: false,
                      error: 'Provider test failed',
                      message: testResult.message,
                      errorType: testResult.errorType,
                      testOnly: true
                  });
              }
              
          } catch (testError) {
              logger.error('TEST-ONLY MODE: Test failed:', testError);
              res.status(400).json({
                  success: false,
                  error: 'Provider test failed',
                  message: testError.message,
                  testOnly: true
              });
          }
          
          return; // Exit early for test-only mode
      }

      // Check if the provider is already initialized and we're just switching
      const isProviderInitialized = aiManager.providers[provider];
      const currentProviderConfig = aiManager.providers[provider];
      
      // For local LLM, check if the model name has changed and needs reinitialization
      const isLocalLLMConfigChanged = provider === 'local' && isProviderInitialized && 
          currentProviderConfig && currentProviderConfig.model !== model;
      
      const isSimpleSwitch = isProviderInitialized && !isLocalLLMConfigChanged && 
          (provider === 'local' || (provider !== 'local' && !apiKey));
      
             if (isSimpleSwitch) {
           logger.info('Provider already initialized with same config, using switchProvider:', provider);
           await aiManager.switchProvider(provider);
       } else {
           // Log why we're reinitializing
           if (isLocalLLMConfigChanged) {
               logger.info('Local LLM model changed, reinitializing provider:', {
                   currentModel: currentProviderConfig?.model,
                   newModel: model
               });
           }
          // Initialize the new provider with API keys
          const config = {
              apiKey: null,
              organizationId: organizationId || null,
              projectId: projectId || null,
              baseUrl,
              model: model,
              temperature,
              maxTokens
          };
          
          // Handle local LLM configuration
          if (provider === 'local') {
              const baseUrlValidation = validateOllamaBaseUrl(baseUrl);
              if (!baseUrlValidation.valid) {
                  return res.status(400).json({
                      error: 'Invalid local LLM base URL',
                      message: `${baseUrlValidation.error}. Use http://127.0.0.1:11434 or configure OLLAMA_ALLOWED_HOSTS for additional hosts.`
                  });
              }
              config.model = model; // Use exact model provided by user
              config.temperature = temperature || 0.2;
              config.maxTokens = maxTokens || 4096;
              // Add GPU configuration from request body
              config.gpuMemoryFraction = req.body.gpuMemoryFraction || 0.9;
              config.numThreads = req.body.numThreads || 0;
              config.batchSize = req.body.batchSize || 512;
              // Advanced GPU settings
              config.gpuOverhead = req.body.gpuOverhead || 1024;
              config.numParallel = req.body.numParallel || 1;
              config.maxLoadedModels = req.body.maxLoadedModels || 1;
              config.keepAlive = req.body.keepAlive || '5m';
              config.gpuLayers = req.body.gpuLayers ?? -1;
              config.selectedGPU = req.body.selectedGPU || 'auto';
          } else {
              // Set the API key using our enhanced getAPIKey function
              config.apiKey = apiKey || getAPIKey(provider, req);
              
              // Log the API key source
              if (apiKey) {
                  logger.info(`Using ${provider} API key provided in request`);
              }
              
              // Ensure we have an API key for non-local providers
              if (!config.apiKey) {
                  logger.warn(`No API key available for ${provider}. Please check your settings or environment variables.`);
                  return res.status(400).json({
                      error: `No API key provided for ${provider}`,
                      message: 'Please check your API key in settings or ensure it is set in your environment variables for local development.'
                  });
              }
          }

          logger.info('\n=== INITIALIZING PROVIDER ===');
          logger.info('Initializing new provider:', {
              provider,
              usingDevKey: process.env.NODE_ENV === 'development' && !!process.env[`${provider.toUpperCase()}_API_KEY`],
              hasApiKey: !!config.apiKey,
              hasOrgId: !!config.organizationId,
              hasProjectId: !!config.projectId,
              hasBaseUrl: !!config.baseUrl,
              hasModel: !!config.model,
              temperature: config.temperature,
              maxTokens: config.maxTokens
          });
          logger.info('Full config:', config);

          // For testOnly mode, we want to test the provider, so skipTest should be false
          await aiManager.initializeProvider(provider, config, false);
          logger.info('Provider initialization completed');
          logger.info('=== END INITIALIZING PROVIDER ===\n');
          
          // Only persist provider settings if not testOnly
          if (!testOnly) {
              saveProviderConfig({ provider, config: { ...config, apiKey: undefined } });
          }
      }

      // Provider has been initialized and saved
      res.json({
          success: true,
          message: `Successfully switched to ${provider}`,
          currentProvider: aiManager.getCurrentProvider(),
          tokenLimits: aiManager.tokenLimits[provider] || {}
      });
  } catch (error) {
      logger.error('Failed to update AI provider:', error);
      res.status(500).json({
          error: 'Failed to update AI provider',
          message: error.message
      });
  }
});

app.post('/api/settings/validate', async (req, res) => {
  try {
      const { provider, apiKey, baseUrl } = req.body;

      // Simple validation
      if (!provider) {
          return res.json({ valid: false });
      }

      // Provider-specific validation
      let isValid = true;
      switch (provider) {
          case 'openai':
              isValid = apiKey && apiKey.startsWith('sk-');
              break;
          case 'anthropic':
              isValid = apiKey && apiKey.startsWith('sk-ant-');
              break;
          case 'gemini':
              isValid = apiKey && apiKey.length > 0;
              break;
          case 'local':
              // For local LLM, validate URL and host restrictions
              isValid = validateOllamaBaseUrl(baseUrl).valid;
              break;
          default:
              isValid = false;
              break;
      }

      res.json({ valid: isValid });
  } catch (error) {
      logger.error('Settings validation failed:', error);
      res.status(500).json({ 
          error: 'Validation failed',
          message: error.message
      });
  }
});

app.get('/api/settings/current-provider', async (req, res) => {
  try {
    // Ensure AI services are ready in serverless cold starts
    await initializeServices();
    if (!aiManager) {
      return res.status(503).json({
        error: 'AI services not ready',
        message: 'AI provider manager failed to initialize'
      });
    }

    const currentProvider = aiManager.getCurrentProvider();
    res.json({
      provider: currentProvider,
      isInitialized: !!(currentProvider && aiManager.providers[currentProvider]),
      availableProviders: Object.keys(aiManager.providers || {}).filter(key => !!aiManager.providers[key]),
      tokenLimits: currentProvider ? (aiManager.tokenLimits[currentProvider] || {}) : {},
      modelConfig: currentProvider ? (aiManager.modelConfigs[currentProvider] || null) : null
    });
  } catch (error) {
    logger.error('Failed to get current provider info:', error);
    res.status(500).json({
      error: 'Failed to get current provider',
      message: error.message
    });
  }
});

// Diagram validation endpoints
app.post('/api/diagram/validate-label', async (req, res) => {
  try {
    const { label, type, currentNodeId, diagram } = req.body;
    
    if (!label || !type || !diagram) {
      return res.status(400).json({ 
        error: 'Missing required fields: label, type, and diagram' 
      });
    }
    
    // Initialize DiagramIndexer
    const DiagramIndexer = require('./services/DiagramIndexReader');
    const indexer = new DiagramIndexer();
    indexer.indexDiagram(diagram);
    
    // Check if label is already used
    const existingNodes = indexer.findNodesByQuery(label);
    
    // Filter out the current node if updating
    const conflictingNodes = existingNodes
      .map(nodeId => indexer.nodeIndex.get(nodeId))
      .filter(node => {
        // If updating, exclude current node
        if (currentNodeId && node.id === currentNodeId) return false;
        // Check for exact label match (case-insensitive)
        return node.data?.label?.toLowerCase() === label.toLowerCase();
      });
    
    if (conflictingNodes.length > 0) {
      const conflict = conflictingNodes[0];
      return res.json({
        valid: false,
        message: `Label "${label}" is already used by ${conflict.type} in ${conflict.data?.zone || 'Unknown'} zone`,
        conflictingNode: {
          id: conflict.id,
          type: conflict.type,
          zone: conflict.data?.zone,
          code: indexer.nodeToCode.get(conflict.id)
        }
      });
    }
    
    res.json({
      valid: true,
      message: 'Label is unique'
    });
    
  } catch (error) {
    logger.error('Label validation error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/diagram/validate-edge-label', async (req, res) => {
  try {
    const { label, currentEdgeId, diagram } = req.body;
    
    if (!label || !diagram) {
      return res.status(400).json({ 
        error: 'Missing required fields: label and diagram' 
      });
    }
    
    // Check if edge label is already used
    const existingEdge = diagram.edges?.find(edge => {
      // If updating, exclude current edge
      if (currentEdgeId && edge.id === currentEdgeId) return false;
      // Check for exact label match (case-insensitive)
      return edge.data?.label?.toLowerCase() === label.toLowerCase();
    });
    
    if (existingEdge) {
      // Find connected nodes for context
      const sourceNode = diagram.nodes.find(n => n.id === existingEdge.source);
      const targetNode = diagram.nodes.find(n => n.id === existingEdge.target);
      
      return res.json({
        valid: false,
        message: `Edge label "${label}" is already used between ${sourceNode?.data?.label || 'Unknown'} and ${targetNode?.data?.label || 'Unknown'}`,
        conflictingEdge: {
          id: existingEdge.id,
          source: sourceNode?.data?.label,
          target: targetNode?.data?.label
        }
      });
    }
    
    res.json({
      valid: true,
      message: 'Edge label is unique'
    });
    
  } catch (error) {
    logger.error('Edge label validation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Image export endpoints
app.post('/api/diagram/export-image', async (req, res) => {
  try {
    const { nodes, edges, width, height, format = 'png', background = '#ffffff' } = req.body;
    
    if (!nodes || !edges) {
      return res.status(400).json({ error: 'Missing required parameters: nodes and edges' });
    }
    
    if (!width || !height || width < 100 || height < 100) {
      return res.status(400).json({ error: 'Invalid dimensions. Width and height must be at least 100px' });
    }
    
    if (!['png', 'jpg', 'jpeg'].includes(format)) {
      return res.status(400).json({ error: 'Invalid format. Supported formats: png, jpg, jpeg' });
    }
    
    logger.info(`Generating ${format} image export: ${width}x${height}`);
    
    // Import the image export service
    const imageExportService = require('./services/ImageExportService');
    
    // Generate the image
    const imageBuffer = await imageExportService.toImage({
      nodes,
      edges,
      width,
      height,
      background
    }, format === 'jpg' ? 'jpeg' : format);
    
    // Set appropriate content type
    const contentType = format === 'png' ? 'image/png' : 'image/jpeg';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="diagram.${format}"`);
    
    // Send the image buffer
    res.status(200).send(imageBuffer);
    
    logger.info(`Successfully exported diagram as ${format}`);
    
  } catch (error) {
    logger.error('Image export error:', error);
    res.status(500).json({ error: 'Failed to export image: ' + error.message });
  }
});


// Handle graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received. Shutting down...');
  process.exit(0);
});


// Ollama-specific endpoints for context window configuration
app.get('/api/ollama/model-info/:modelName', async (req, res) => {
  try {
    const { modelName } = req.params;
    const axios = require('axios');
    
    // Get the Ollama base URL from the current local provider config
    let baseUrl = 'http://127.0.0.1:11434';
    if (aiManager && aiManager.providers.local && aiManager.localLLMConfig) {
      baseUrl = aiManager.localLLMConfig.baseUrl;
      logger.info(`Original Ollama baseUrl: ${baseUrl}`);
      // Force IPv4 to avoid ECONNREFUSED on IPv6
      baseUrl = baseUrl.replace('http://localhost', 'http://127.0.0.1');
      logger.info(`IPv4 Ollama baseUrl: ${baseUrl}`);
    }
    
    // Get detailed model information from Ollama
    const response = await axios.post(safeOllamaUrl(baseUrl, '/api/show'), {
      name: modelName
    }, {
      timeout: 5000
    });
    
    // Log the raw response from Ollama for debugging
    logger.error('Raw response from Ollama /api/show:', JSON.stringify(response.data, null, 2));

    // Extract context length – supports both old and new Ollama formats
    let numCtx = 8192; // sensible fallback

    /*
      New (2024+) JSON structure example:
        {
          "name": "llama3",
          "details": {
            "parameters": { "context_length": 131072, ... }
          }
        }

      Older releases returned a flat `parameters` string with "num_ctx <value>".
    */
    if (response.data?.details?.parameters?.context_length) {
      numCtx = Number(response.data.details.parameters.context_length);
    } else if (response.data?.details?.context_length) {
      numCtx = Number(response.data.details.context_length);
    } else if (response.data?.context_length) {
      numCtx = Number(response.data.context_length);
    } else if (response.data?.parameters) {
      // Legacy string format – look for num_ctx
      const paramsMatch = response.data.parameters.match(/num_ctx\s+(\d+)/i);
      if (paramsMatch) {
        numCtx = parseInt(paramsMatch[1], 10);
      }
    } else if (response.data?.modelfile) {
      const matchCtx = response.data.modelfile.match(/context_length\s+(\d+)/i) || response.data.modelfile.match(/num_ctx\s+(\d+)/i);
      if (matchCtx) {
        numCtx = parseInt(matchCtx[1], 10);
      }
    }
    
    // Final fallback: brute-force search the entire stringified response if we still have the default
    if (numCtx === 8192) {
      try {
        const responseString = JSON.stringify(response.data);
        // This regex handles: "context_length":131072, "context_length":"131072", num_ctx=131072 etc.
        const regex = /["']?(?:context_length|num_ctx)["']?\s*[:=]\s*["']?(\d+)["']?/i;
        const match = responseString.match(regex);
        if (match && match[1]) {
          numCtx = parseInt(match[1], 10);
          logger.info(`Context length found via brute-force regex: ${numCtx}`);
        }
      } catch (e) {
        // Ignore errors
      }
    }
    
    res.json({
      success: true,
      model: modelName,
      num_ctx: numCtx,
      context_length: numCtx,
      parameters: response.data.parameters || null,
      modelfile: response.data.modelfile || null
    });
  } catch (error) {
    logger.error('Failed to get Ollama model info:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get model information'
    });
  }
});

app.post('/api/ollama/create-custom-model', async (req, res) => {
  try {
    const { basedOn, modelName, contextSize } = req.body;
    const axios = require('axios');
    
    if (!basedOn || !modelName || !contextSize) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: basedOn, modelName, contextSize'
      });
    }
    
    // Get the Ollama base URL from the current local provider config
    let baseUrl = 'http://127.0.0.1:11434';
    if (aiManager && aiManager.providers.local && aiManager.localLLMConfig) {
      baseUrl = aiManager.localLLMConfig.baseUrl;
      // Force IPv4 to avoid ECONNREFUSED on IPv6
      baseUrl = baseUrl.replace('http://localhost', 'http://127.0.0.1');
    }
    
    // Ensure Ollama daemon is running (will auto-start if necessary)
    await ensureOllamaDaemon(baseUrl);
    
    // Create a Modelfile for the custom model
    const modelfile = `FROM ${basedOn}
 PARAMETER NUM_CTX ${contextSize}`;
    
    // Ollama model names must be lowercase and cannot contain ':' or spaces
    const safeModelName = String(modelName).toLowerCase().replace(/[^a-z0-9._-]/g, '_');
    if (safeModelName !== modelName) {
      logger.warn(`Model name sanitized from '${modelName}' to '${safeModelName}'`);
    }
    
    // Create the custom model
    const response = await axios.post(safeOllamaUrl(baseUrl, '/api/create'), {
      model: safeModelName,
      modelfile: modelfile,
      stream: false
    }, {
      timeout: 60000 // 60 seconds for model creation
    });
    
    res.json({
      success: true,
      message: `Created custom model ${safeModelName} with context size ${contextSize}`,
      model: safeModelName,
      response: response.data
    });
  } catch (error) {
    const errMsg = error.response?.data || error.message;
    logger.error('Failed to create custom Ollama model:', errMsg);
    res.status(500).json({
      success: false,
      error: typeof errMsg === 'string' ? errMsg : JSON.stringify(errMsg)
    });
  }
});

// GPU status endpoint for Ollama
app.get('/api/ollama/gpu-status', async (req, res) => {
  try {
    // Get GPU info from AI manager if available
    if (!aiManager || aiManager.getCurrentProvider() !== 'local' || !aiManager.localLLMConfig) {
      return res.json({
        success: true,
        gpuInfo: {
          available: false,
          inUse: false,
          layersOnGPU: 0,
          totalLayers: 0,
          message: 'Local LLM not configured or not active'
        }
      });
    }
    
    // Start with stored info or defaults
    let gpuInfo = aiManager.localLLMConfig.gpuInfo || {
      available: false,
      inUse: false,
      layersOnGPU: 0,
      totalLayers: 0
    };
    
    // Clone to avoid modifying stored data
    gpuInfo = { ...gpuInfo };
    
    // Get additional runtime info if available
    const baseUrl = aiManager.localLLMConfig.baseUrl.replace('http://localhost', 'http://127.0.0.1');
    
    try {
      // Get running models info
      const psResponse = await fetch(safeOllamaUrl(baseUrl, '/api/ps'));
      if (psResponse.ok) {
        const psData = await psResponse.json();
        
        // Check current running models for GPU usage
        if (psData.models && Array.isArray(psData.models)) {
          for (const model of psData.models) {
            if (model.name === aiManager.localLLMConfig.model) {
              // Update with live data if available
              if (model.details && model.details.gpu_layers !== undefined) {
                gpuInfo.layersOnGPU = model.details.gpu_layers;
                gpuInfo.inUse = model.details.gpu_layers > 0;
              }
              
              // Add memory usage info if available
              if (model.size) {
                gpuInfo.memoryUsage = model.size;
              }
              
              break;
            }
          }
        }
      }
    } catch (psError) {
      logger.debug('Could not fetch runtime GPU info:', psError.message);
    }
    
    // Try to detect GPU capabilities from Ollama version endpoint
    if (!gpuInfo.available) {
      try {
        const versionResponse = await fetch(safeOllamaUrl(baseUrl, '/api/version'));
        if (versionResponse.ok) {
          const versionData = await versionResponse.json();
          logger.debug('Ollama version info:', versionData);
          
          // Check for GPU support indicators in version string
          if (versionData.version) {
            // Most Ollama builds include CUDA support if GPU is available
            // We'll mark GPU as available and let the user know they need to configure it
            gpuInfo.available = true;
            gpuInfo.detectedFromVersion = true;
          }
        }
      } catch (versionError) {
        logger.debug('Could not fetch Ollama version info:', versionError.message);
      }
    }
    
    // Check environment for GPU indicators
    if (!gpuInfo.available && process.env.CUDA_VISIBLE_DEVICES !== undefined) {
      gpuInfo.available = true;
      gpuInfo.detectedFromEnv = true;
    }
    
    // Add descriptive message
    if (gpuInfo.available && gpuInfo.inUse) {
      gpuInfo.message = `GPU acceleration active: ${gpuInfo.layersOnGPU}${gpuInfo.totalLayers > 0 ? '/' + gpuInfo.totalLayers : ''} layers on GPU`;
    } else if (gpuInfo.available || gpuInfo.detectedFromVersion || gpuInfo.detectedFromEnv) {
      gpuInfo.message = 'GPU likely available but not configured. To enable: ollama run modelname --gpu-layers -1';
    } else {
      gpuInfo.message = 'No GPU detected - using CPU only';
    }
    
    res.json({
      success: true,
      gpuInfo: gpuInfo,
      model: aiManager.localLLMConfig.model,
      contextWindow: aiManager.localLLMConfig.contextWindow || 8192
    });
    
  } catch (error) {
    logger.error('Failed to get GPU status:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get GPU status'
    });
  }
});

// Message history compaction endpoint
app.post('/api/messages/compact', async (req, res) => {
  try {
    const { messages, availableTokens, settings } = req.body;
    
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid messages array'
      });
    }
    
    // Get appropriate model config from settings
    const modelConfig = settings?.api?.llmMode === 'local' 
      ? { model: settings.api.localLLM?.model || 'llama3.1:8b' }
      : {};
    
    // Initialize Message Compaction service
    const MessageCompactionService = require('./services/MessageCompactionService');
    const compactionService = MessageCompactionService.getInstance(modelConfig);
    
    // Perform compaction
    const compacted = await compactionService.compactMessageHistory(
      messages,
      availableTokens || 8192,
      {
        preserveRecent: settings?.preserveRecent || 3,
        enableAISummary: settings?.enableAISummary || false,
        compressionRatio: settings?.compressionRatio || 0.3
      }
    );
    
    res.json({
      success: true,
      messages: compacted.messages,
      metadata: compacted.metadata
    });
    
  } catch (error) {
    logger.error('Message compaction failed:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to compact messages'
    });
  }
});

// Note: User settings endpoints removed - no authentication system in use
// Settings are now handled client-side with localStorage

// Catch-all route: this backend doesn't serve the SPA in packaged builds.
// Return a small informative page instead of a confusing build error.
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }

  const port = process.env.PORT || 'unknown';
  const env = process.env.NODE_ENV || 'development';
  const infoPage = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>ContextCypher - Backend</title>
    <style>
      body { font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; margin: 40px; color: #222; }
      code { background: #f4f4f4; padding: 2px 6px; border-radius: 4px; }
      .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 12px; background: #eee; margin-left: 8px; }
      a { color: #0a66c2; text-decoration: none; }
      a:hover { text-decoration: underline; }
    </style>
  </head>
  <body>
    <h1>ContextCypher - Backend API</h1>
    <p>This is the backend API server for ContextCypher. The web UI is served separately.</p>
    <p>
      Status: <span class="badge">${env}</span>
      <span class="badge">port ${port}</span>
    </p>
    <p>
      Health check: <a href="/api/health">/api/health</a>
    </p>
    <p>
      To access the application, please go to: <a href="/">the application root</a>
    </p>
    <p style="margin-top: 20px; font-size: 14px; color: #666;">
      Note: The frontend is served on the same port as this API server.
    </p>
  </body>
  </html>`;

  res.status(200).type('html').send(infoPage);
});

// Add comprehensive error handling with rate limiting to prevent spam
let lastExceptionTime = 0;
let exceptionCount = 0;
const EXCEPTION_COOLDOWN = 5000; // 5 seconds
const MAX_EXCEPTIONS_PER_PERIOD = 10;
const isServerlessRuntime = !!(process.env.IS_VERCEL || process.env.VERCEL);

process.on('uncaughtException', (error) => {
  const timestamp = new Date().toISOString();
  const now = Date.now();
  
  // Reset counter if enough time has passed
  if (now - lastExceptionTime > EXCEPTION_COOLDOWN) {
    exceptionCount = 0;
  }
  
  exceptionCount++;
  lastExceptionTime = now;
  
  // Only log if we haven't hit the rate limit
  if (exceptionCount <= MAX_EXCEPTIONS_PER_PERIOD) {
    try {
      // Use console.error directly to avoid potential logger issues
      console.error(`[${timestamp}] 💥 UNCAUGHT EXCEPTION #${exceptionCount}:`, {
        name: error?.name || 'Unknown',
        message: error?.message || 'No message',
        code: error?.code || 'No code',
        stack: error?.stack ? error.stack.split('\n').slice(0, 10).join('\n') : 'No stack'
      });
      
      // Try to log to file logger if available
      if (logger && typeof logger.error === 'function') {
        logger.error(`[${timestamp}] 💥 UNCAUGHT EXCEPTION #${exceptionCount}:`, {
          name: error?.name,
          message: error?.message,
          stack: error?.stack,
          code: error?.code
        });
      }
    } catch (logError) {
      // If even console.error fails, write to stderr directly
      process.stderr.write(`[${timestamp}] Failed to log uncaught exception: ${logError.message}\n`);
      process.stderr.write(`[${timestamp}] Original error: ${error?.message || 'Unknown error'}\n`);
    }
  } else if (exceptionCount === MAX_EXCEPTIONS_PER_PERIOD + 1) {
    console.error(`[${timestamp}] 🚨 EXCEPTION RATE LIMIT REACHED - Suppressing further exception logs for ${EXCEPTION_COOLDOWN}ms`);
  }
  
  // Never force-exit in serverless runtimes (Vercel). Let the platform handle
  // invocation lifecycle so we can preserve error responses and logs.
  if (isServerlessRuntime) {
    console.error(`[${timestamp}] Serverless runtime detected; not exiting process after uncaught exception`);
    return;
  }

  // Exit process after too many exceptions or after a delay for the first few
  if (exceptionCount >= MAX_EXCEPTIONS_PER_PERIOD) {
    console.error(`[${timestamp}] 🚨 TOO MANY UNCAUGHT EXCEPTIONS (${exceptionCount}) - Shutting down server immediately`);
    process.exit(1);
  } else {
    // For first few exceptions, give a chance for cleanup
    setTimeout(() => {
      console.error(`[${timestamp}] Shutting down server due to uncaught exception...`);
      process.exit(1);
    }, 1000);
  }
});

process.on('unhandledRejection', (reason, promise) => {
  const timestamp = new Date().toISOString();
  
  try {
    console.error(`[${timestamp}] 💥 UNHANDLED REJECTION:`, {
      reason: reason?.message || reason || 'Unknown reason',
      promise: promise ? 'Promise rejected' : 'No promise info'
    });
    
    if (logger && typeof logger.error === 'function') {
      logger.error(`[${timestamp}] 💥 UNHANDLED REJECTION:`, {
        reason: reason,
        promise: promise
      });
    }
  } catch (logError) {
    process.stderr.write(`[${timestamp}] Failed to log unhandled rejection: ${logError.message}\n`);
  }
});

// Add connection tracking middleware
app.use((req, res, next) => {
  const connectionId = `${req.ip}-${Date.now()}`;
  const timestamp = new Date().toISOString();
  
  activeConnections++;
  connectionTracker.set(connectionId, { start: timestamp, path: req.path });
  
  logger.info(`[${timestamp}] 📥 Connection opened: ${connectionId}`);
  logger.info(`[${timestamp}] Active connections: ${activeConnections}`);
  
  res.on('finish', () => {
    const endTime = new Date().toISOString();
    activeConnections--;
    connectionTracker.delete(connectionId);
    
    logger.info(`[${endTime}] 📤 Connection closed: ${connectionId}`);
    logger.info(`[${endTime}] Active connections: ${activeConnections}`);
    logger.info(`[${endTime}] Response status: ${res.statusCode}`);
  });
  
  res.on('close', () => {
    const closeTime = new Date().toISOString();
    if (connectionTracker.has(connectionId)) {
      activeConnections--;
      connectionTracker.delete(connectionId);
      logger.warn(`[${closeTime}] ⚠️ Connection aborted: ${connectionId}`);
      logger.warn(`[${closeTime}] Active connections: ${activeConnections}`);
    }
  });
  
  next();
});

// Log server status periodically (skip on Vercel - serverless functions are ephemeral)
if (!isVercel) {
  setInterval(() => {
    const timestamp = new Date().toISOString();
    const memory = process.memoryUsage();
    const memoryMB = {
      rss: (memory.rss / 1024 / 1024).toFixed(2) + ' MB',
      heapTotal: (memory.heapTotal / 1024 / 1024).toFixed(2) + ' MB',
      heapUsed: (memory.heapUsed / 1024 / 1024).toFixed(2) + ' MB',
      external: (memory.external / 1024 / 1024).toFixed(2) + ' MB'
    };

    logger.info(`[${timestamp}] 📊 SERVER STATUS:`, {
      uptime: process.uptime() + ' seconds',
      activeConnections: activeConnections,
      memory: memoryMB,
      pid: process.pid,
      port: process.env.ACTUAL_PORT || process.env.PORT || 'unknown',
      nodeVersion: process.version,
      platform: process.platform
    });

    // Warn if memory usage is high
    if (memory.heapUsed > 500 * 1024 * 1024) { // 500MB
      logger.warn(`[${timestamp}] ⚠️ HIGH MEMORY USAGE: ${memoryMB.heapUsed}`);
    }
  }, 60000); // Every minute
}

// Use the enhanced server startup with port finding (skip on Vercel - handled by serverless runtime)
if (!isVercel) {
  startServer().catch(error => {
    logger.error('Failed to start server:', error);
    process.exit(1);
  });
}

module.exports = { app };

var ensureOllamaDaemon = async function (baseUrl = 'http://127.0.0.1:11434') {
  // Implementation for ensuring Ollama daemon is running
  // This function should return a promise that resolves when the daemon is ready
  // You can use any method you prefer to check if the daemon is running
  // For example, you can use a simple HTTP request to check if the daemon is ready
  try {
    const response = await fetch(safeOllamaUrl(baseUrl, '/api/status'));
    if (response.status === 200) {
      logger.info('Ollama daemon is running');
      return true;
    } else {
      logger.warn('Ollama daemon is not running');
      return false;
    }
  } catch (error) {
    logger.error('Failed to check Ollama daemon status:', error);
    return false;
  }
};
