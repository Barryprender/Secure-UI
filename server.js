/**
 * Secure-UI Component Server
 *
 * Serves built web components from the dist/ folder with:
 * - CORS support for cross-origin access
 * - Version routing (/v1, /latest)
 * - Proper MIME types
 * - Cache headers
 * - Component catalog/listing
 */

import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 4000;
const DIST_DIR = path.join(__dirname, 'dist');
const SRC_DIR = path.join(__dirname, 'src');

// Read package.json for version info
const packageJson = JSON.parse(
  readFileSync(path.join(__dirname, 'package.json'), 'utf-8')
);
const VERSION = packageJson.version;

// CORS configuration - allow all origins for component sharing
app.use(cors({
  origin: '*',
  methods: ['GET', 'HEAD', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false
}));

// Security headers
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Set proper cache headers for components
app.use((req, res, next) => {
  // Cache versioned resources for 1 year
  if (req.url.match(/\/v\d+\//)) {
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
  }
  // Cache latest for 5 minutes
  else if (req.url.match(/\/latest\//)) {
    res.set('Cache-Control', 'public, max-age=300');
  }
  // No cache for root/catalog
  else {
    res.set('Cache-Control', 'no-cache');
  }
  next();
});

/**
 * Examples page - Interactive component showcase
 */
app.get('/examples', (req, res) => {
  const examplesPath = path.join(__dirname, 'examples', 'index.html');
  if (existsSync(examplesPath)) {
    res.sendFile(examplesPath);
  } else {
    res.status(404).json({ error: 'Examples page not found' });
  }
});

/**
 * Component Catalog - List all available components
 */
app.get('/', (req, res) => {
  const components = [
    'secure-input',
    'secure-textarea',
    'secure-select',
    'secure-form',
    'secure-file-upload',
    'secure-datetime',
    'secure-table'
  ];

  const catalog = {
    name: packageJson.name,
    version: VERSION,
    description: packageJson.description,
    components: components.map(name => ({
      name,
      urls: {
        latest: `${req.protocol}://${req.get('host')}/latest/components/${name}/${name}.js`,
        versioned: `${req.protocol}://${req.get('host')}/v${VERSION.split('.')[0]}/components/${name}/${name}.js`,
        specific: `${req.protocol}://${req.get('host')}/v${VERSION}/components/${name}/${name}.js`
      },
      usage: `<script type="module" src="${req.protocol}://${req.get('host')}/latest/components/${name}/${name}.js"></script>`
    })),
    styles: {
      tokens: {
        latest: `${req.protocol}://${req.get('host')}/latest/styles/tokens.css`,
        versioned: `${req.protocol}://${req.get('host')}/v${VERSION}/styles/tokens.css`
      }
    },
    endpoints: {
      catalog: `${req.protocol}://${req.get('host')}/`,
      latest: `${req.protocol}://${req.get('host')}/latest/`,
      versioned: `${req.protocol}://${req.get('host')}/v${VERSION}/`,
      majorVersion: `${req.protocol}://${req.get('host')}/v${VERSION.split('.')[0]}/`
    }
  };

  res.json(catalog);
});

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  const distExists = existsSync(DIST_DIR);
  res.json({
    status: distExists ? 'healthy' : 'unhealthy',
    version: VERSION,
    timestamp: new Date().toISOString()
  });
});

/**
 * Serve /latest/* from dist/
 */
app.use('/latest', express.static(DIST_DIR, {
  setHeaders: (res, filePath) => {
    // Set proper MIME types
    if (filePath.endsWith('.js')) {
      res.set('Content-Type', 'application/javascript; charset=utf-8');
    } else if (filePath.endsWith('.css')) {
      res.set('Content-Type', 'text/css; charset=utf-8');
    }
    // Add CORS headers explicitly
    res.set('Access-Control-Allow-Origin', '*');
  }
}));

// Fallback to src for development (for files not in dist, like showcase styles)
app.use('/latest', express.static(SRC_DIR, {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.js')) {
      res.set('Content-Type', 'application/javascript; charset=utf-8');
    } else if (filePath.endsWith('.css')) {
      res.set('Content-Type', 'text/css; charset=utf-8');
    }
    res.set('Access-Control-Allow-Origin', '*');
  }
}));

/**
 * Serve /v{major}/* from dist/ (e.g., /v0/)
 * Maps to current dist if major version matches
 */
app.use(`/v${VERSION.split('.')[0]}`, express.static(DIST_DIR, {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.js')) {
      res.set('Content-Type', 'application/javascript; charset=utf-8');
    } else if (filePath.endsWith('.css')) {
      res.set('Content-Type', 'text/css; charset=utf-8');
    }
    res.set('Access-Control-Allow-Origin', '*');
  }
}));

/**
 * Serve /v{version}/* from dist/ (e.g., /v0.1.0/)
 * Maps to current dist if version matches exactly
 */
app.use(`/v${VERSION}`, express.static(DIST_DIR, {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.js')) {
      res.set('Content-Type', 'application/javascript; charset=utf-8');
    } else if (filePath.endsWith('.css')) {
      res.set('Content-Type', 'text/css; charset=utf-8');
    }
    res.set('Access-Control-Allow-Origin', '*');
  }
}));

/**
 * Legacy support - serve directly from /components/* and /styles/*
 */
app.use('/components', express.static(path.join(DIST_DIR, 'components'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.js')) {
      res.set('Content-Type', 'application/javascript; charset=utf-8');
    }
    res.set('Access-Control-Allow-Origin', '*');
  }
}));

app.use('/styles', express.static(path.join(DIST_DIR, 'styles'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.css')) {
      res.set('Content-Type', 'text/css; charset=utf-8');
    }
    res.set('Access-Control-Allow-Origin', '*');
  }
}));

// Fallback to src/styles for development (for styles not in dist)
app.use('/styles', express.static(path.join(SRC_DIR, 'styles'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.css')) {
      res.set('Content-Type', 'text/css; charset=utf-8');
    }
    res.set('Access-Control-Allow-Origin', '*');
  }
}));

/**
 * E2E test fixtures — dev/test only, never exposed in production
 */
if (process.env.NODE_ENV !== 'production') {
  app.use('/test-fixtures', express.static(path.join(__dirname, 'tests/e2e/fixtures')));
}

/**
 * 404 handler
 */
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Component or resource not found: ${req.url}`,
    catalog: `${req.protocol}://${req.get('host')}/`
  });
});

/**
 * Start the server
 */
app.listen(PORT, () => {
  console.log('\n🚀 Secure-UI Component Server Started\n');
  console.log(`📦 Package: ${packageJson.name}`);
  console.log(`🔢 Version: ${VERSION}`);
  console.log(`🌐 Server: http://localhost:${PORT}`);
  console.log(`📁 Serving: ${DIST_DIR}`);
  console.log('\n📚 Endpoints:');
  console.log(`   - http://localhost:${PORT}/                    (Component Catalog)`);
  console.log(`   - http://localhost:${PORT}/examples            (Examples Page)`);
  console.log(`   - http://localhost:${PORT}/health              (Health Check)`);
  console.log(`   - http://localhost:${PORT}/latest/...          (Latest Version)`);
  console.log(`   - http://localhost:${PORT}/v${VERSION.split('.')[0]}/...             (Major Version)`);
  console.log(`   - http://localhost:${PORT}/v${VERSION}/...        (Specific Version)`);
  console.log('\n🎯 Example Usage:');
  console.log(`   <script type="module" src="http://localhost:${PORT}/latest/components/secure-input/secure-input.js"></script>`);
  console.log(`   <link rel="stylesheet" href="http://localhost:${PORT}/latest/styles/tokens.css">`);
  console.log('\n⚠️  Note: Make sure to run "npm run build" first to generate dist/ folder');
  console.log('\nPress Ctrl+C to stop\n');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down gracefully...');
  process.exit(0);
});
