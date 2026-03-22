const logger = require('./logger-wrapper');

const APP_SECRET_DEFAULTS = {
  localProduction: 'contextcypher-local-prod-secret',
  localDevelopment: 'contextcypher-local-dev-secret'
};

function isProductionRuntime() {
  return process.env.NODE_ENV === 'production' || process.env.FORCE_PRODUCTION === 'true';
}

function resolveExpectedAppSecret() {
  if (isProductionRuntime()) {
    return process.env.LOCAL_PROD_APP_SECRET || process.env.APP_SECRET || APP_SECRET_DEFAULTS.localProduction;
  }

  return process.env.LOCAL_DEV_APP_SECRET || process.env.APP_SECRET || APP_SECRET_DEFAULTS.localDevelopment;
}

function resolveAppSecretMode() {
  return isProductionRuntime() ? 'local_production' : 'local_development';
}

function getServerHost() {
  const env = process.env.NODE_ENV || 'development';
  const forceProduction = process.env.FORCE_PRODUCTION === 'true';

  if (forceProduction) {
    logger.info('FORCE_PRODUCTION is set, using production host settings');
    return '127.0.0.1';
  }

  switch(env) {
    case 'production':
      return '127.0.0.1';

    case 'test':
      return '0.0.0.0';

    case 'development':
      return process.env.BIND_ALL_INTERFACES === 'true' ? '0.0.0.0' : '127.0.0.1';

    default:
      logger.warn(`Unknown environment: ${env}, defaulting to localhost`);
      return '127.0.0.1';
  }
}

function isAllowedLocalOrigin(origin, options = {}) {
  const { allowPrivateNetworkHosts = false } = options;

  if (!origin) {
    return true;
  }

  if (origin.startsWith('tauri://') || origin.startsWith('file://')) {
    return true;
  }

  try {
    const url = new URL(origin);
    const hostname = url.hostname;

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return false;
    }

    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return true;
    }

    return allowPrivateNetworkHosts &&
      /^(10|172\.(1[6-9]|2\d|3[01])|192\.168)\.\d{1,3}\.\d{1,3}$/.test(hostname);
  } catch {
    return false;
  }
}

function createOriginValidator(env, options = {}) {
  return function(origin, callback) {
    if (origin) {
      logger.debug(`CORS request from origin: ${origin}`);
    }

    if (isAllowedLocalOrigin(origin, options)) {
      callback(null, true);
      return;
    }

    logger.warn(`CORS blocked request from origin: ${origin || 'NO ORIGIN'} in environment: ${env}`);
    callback(new Error('Not allowed by CORS'));
  };
}

function getCorsOptions() {
  const env = process.env.NODE_ENV || 'development';

  const corsOptions = {
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-App-Secret', 'x-offline-mode'],
    exposedHeaders: ['X-Request-ID'],
    maxAge: 86400,
    preflightContinue: false,
    optionsSuccessStatus: 204
  };

  switch(env) {
    case 'production':
      corsOptions.origin = function (origin, callback) {
        logger.info(`[PRODUCTION CORS] Request from origin: ${origin || 'NO ORIGIN'} in environment: ${env}`);

        const allowedOrigins = [
          'tauri://localhost',
          'https://tauri.localhost',
          'http://tauri.localhost',
          'wry://tauri',
          'http://localhost:1420',
          'http://127.0.0.1:1420',
          'file://',
          'http://localhost:3001',
          'http://localhost:3002',
          'http://localhost:3003',
          'http://127.0.0.1:3001',
          'http://127.0.0.1:3002',
          'http://127.0.0.1:3003'
        ];

        const allowedPrefixes = [
          'tauri://',
          'https://tauri.',
          'http://tauri.',
          'wry://',
          'file://',
          'asset.localhost',
          'https://asset.localhost',
          'http://asset.localhost',
          'http://localhost:',
          'http://127.0.0.1:',
          'https://localhost:',
          'https://127.0.0.1:'
        ];

        if (!origin) {
          logger.info('[PRODUCTION CORS] Allowed request with no origin (local request)');
          callback(null, true);
        } else if (allowedOrigins.includes(origin) ||
                   allowedPrefixes.some(prefix => origin.startsWith(prefix)) ||
                   origin.includes('asset.localhost')) {
          logger.info(`[PRODUCTION CORS] Allowed origin: ${origin}`);
          callback(null, true);
        } else {
          logger.warn(`[PRODUCTION CORS] BLOCKED request from origin: ${origin}`);
          logger.warn(`[PRODUCTION CORS] Full request details:`, {
            origin,
            env: process.env.NODE_ENV,
            forceProduction: process.env.FORCE_PRODUCTION
          });

          if (process.env.DEBUG_CORS === 'true') {
            logger.warn(`[PRODUCTION CORS] DEBUG MODE - Allowing blocked origin for debugging`);
            callback(null, true);
          } else {
            callback(new Error('Not allowed by CORS'));
          }
        }
      };
      break;

    case 'development':
      corsOptions.origin = createOriginValidator(env, { allowPrivateNetworkHosts: true });
      break;

    case 'test':
      corsOptions.origin = createOriginValidator(env);
      break;

    default:
      corsOptions.origin = ['http://localhost:3000', 'http://127.0.0.1:3000'];
  }

  return corsOptions;
}

function securityHeaders(req, res, next) {
  const timestamp = new Date().toISOString();
  logger.debug(`[${timestamp}] Applying security headers for ${req.method} ${req.path}`);

  if (req.method === 'OPTIONS') {
    logger.debug(`[${timestamp}] OPTIONS request - applying minimal headers`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return next();
  }
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');

  const env = process.env.NODE_ENV || 'development';

  logger.debug(`[${new Date().toISOString()}] Applying CSP for environment: ${env}`);

  if (req.path.startsWith('/api/')) {
    logger.debug(`[${new Date().toISOString()}] Skipping CSP for API endpoint: ${req.path}`);
  } else {
    const cspDirectives = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self' data:",
      env === 'production'
        ? "connect-src 'self' https://api.openai.com https://api.anthropic.com https://generativelanguage.googleapis.com wss://localhost:* ws://localhost:* http://localhost:* https://localhost:*"
        : "connect-src 'self' http://localhost:* https://localhost:* ws://localhost:* wss://localhost:* http://127.0.0.1:* https://127.0.0.1:* ws://127.0.0.1:* wss://127.0.0.1:* https://api.openai.com https://api.anthropic.com https://generativelanguage.googleapis.com http://172.*:* https://172.*:* http://192.168.*:* https://192.168.*:* http://10.*:* https://10.*:*",
      "frame-ancestors 'none'"
    ];
    res.setHeader('Content-Security-Policy', cspDirectives.join('; '));
  }

  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }

  res.removeHeader('X-Powered-By');

  next();
}

function validateAppSecret(req, res, next) {
  if (process.env.NODE_ENV === 'test') {
    return next();
  }

  if (req.path === '/api/health') {
    return next();
  }

  if (req.method === 'OPTIONS') {
    return next();
  }

  if (process.env.NODE_ENV === 'development' && process.env.REQUIRE_APP_SECRET !== 'true') {
    logger.debug(`Skipping app secret validation for ${req.method} ${req.path} in development`);
    return next();
  }

  const appSecret = req.headers['x-app-secret'];
  const expectedSecret = resolveExpectedAppSecret();
  const secretMode = resolveAppSecretMode();

  if (
    isProductionRuntime() &&
    (secretMode === 'local_production' && !process.env.LOCAL_PROD_APP_SECRET && !process.env.APP_SECRET)
  ) {
    logger.warn(
      `Using built-in ${secretMode} app secret fallback. Set environment variables for hardened production deployments.`
    );
  }

  if (appSecret !== expectedSecret) {
    logger.warn(`Invalid app secret from ${req.ip} to ${req.method} ${req.path}`);
    logger.debug('Invalid app secret details:', {
      mode: secretMode,
      provided: !!appSecret,
      providedLength: typeof appSecret === 'string' ? appSecret.length : 0
    });
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid or missing application credentials'
    });
  }

  next();
}

function getServerConfig() {
  const env = process.env.NODE_ENV || 'development';

  const configs = {
    production: {
      host: process.env.BIND_ALL_INTERFACES === 'true' ? '0.0.0.0' : '127.0.0.1',
      enableDebugEndpoints: false,
      exposeStackTraces: false,
      logLevel: 'info',
      requireAppSecret: true
    },
    development: {
      host: getServerHost(),
      enableDebugEndpoints: true,
      exposeStackTraces: true,
      logLevel: 'debug',
      requireAppSecret: process.env.REQUIRE_APP_SECRET === 'true'
    },
    test: {
      host: '0.0.0.0',
      enableDebugEndpoints: true,
      exposeStackTraces: true,
      logLevel: 'debug',
      requireAppSecret: false
    }
  };

  logger.debug(`Server config for ${env}:`, configs[env] || configs.development);

  return configs[env] || configs.development;
}

function logSecurityWarnings(config, port) {
  if (config.host === '0.0.0.0') {
    logger.warn('WARNING: Server is accessible from all network interfaces!');
    logger.warn('This should only be used in controlled environments.');
    logger.warn(`Server is listening on http://0.0.0.0:${port}`);
    logger.warn('To restrict to localhost only, unset BIND_ALL_INTERFACES');
  }

  if (!config.requireAppSecret) {
    logger.warn('WARNING: App secret validation is disabled');
  }

  if (config.exposeStackTraces) {
    logger.info('Stack traces are enabled in error responses');
  }
}

module.exports = {
  getServerHost,
  getCorsOptions,
  securityHeaders,
  validateAppSecret,
  getServerConfig,
  logSecurityWarnings
};
