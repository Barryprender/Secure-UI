# Component Server Documentation

The Secure-UI Component Server serves built web components from the `dist/` folder, allowing projects to consume components via HTTP instead of npm packages.

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Build Components
```bash
npm run build
```

### 3. Start Server
```bash
npm run serve
```

The server will start on `http://localhost:4000` by default.

### Development Mode (with auto-restart)
```bash
npm run dev
```

This builds the components and starts the server with `--watch` flag for automatic restarts.

## 📡 API Endpoints

### Component Catalog
**GET /** - Returns JSON catalog of all available components

```bash
curl http://localhost:4000/
```

Response includes:
- Component list with URLs
- Available versions
- Usage examples
- Style token URLs

### Health Check
**GET /health** - Server health status

```bash
curl http://localhost:4000/health
```

### Versioned Components

The server supports multiple versioning strategies:

#### 1. Latest Version (Recommended for development)
```html
<script type="module" src="http://localhost:4000/latest/components/secure-input/secure-input.js"></script>
```
- **Cache:** 5 minutes
- **Use case:** Development, always get latest version

#### 2. Major Version (Recommended for production)
```html
<script type="module" src="http://localhost:4000/v0/components/secure-input/secure-input.js"></script>
```
- **Cache:** 1 year (immutable)
- **Use case:** Production, guaranteed compatibility within major version

#### 3. Specific Version (Pinned)
```html
<script type="module" src="http://localhost:4000/v0.1.0/components/secure-input/secure-input.js"></script>
```
- **Cache:** 1 year (immutable)
- **Use case:** When you need to pin to exact version

#### 4. Legacy (No version prefix)
```html
<script type="module" src="http://localhost:4000/components/secure-input/secure-input.js"></script>
```
- For backward compatibility

## 🎨 Loading Styles

### Design Tokens (CSS Variables)
```html
<link rel="stylesheet" href="http://localhost:4000/latest/styles/tokens.css">
```

Or with versioning:
```html
<link rel="stylesheet" href="http://localhost:4000/v0/styles/tokens.css">
```

## 📦 Example Usage

### Basic HTML Page
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>My App</title>
  <!-- Load design tokens -->
  <link rel="stylesheet" href="http://localhost:4000/latest/styles/tokens.css">
</head>
<body>
  <!-- Use the components -->
  <secure-input
    label="Email"
    name="email"
    type="email"
    required
  ></secure-input>

  <secure-textarea
    label="Message"
    name="message"
    rows="5"
  ></secure-textarea>

  <!-- Load component scripts -->
  <script type="module" src="http://localhost:4000/latest/components/secure-input/secure-input.js"></script>
  <script type="module" src="http://localhost:4000/latest/components/secure-textarea/secure-textarea.js"></script>
</body>
</html>
```

### Dynamic Import (JavaScript)
```javascript
// Load component dynamically
const { SecureInput } = await import('http://localhost:4000/latest/components/secure-input/secure-input.js');

// Define custom element
customElements.define('secure-input', SecureInput);
```

## 🔧 Configuration

### Port
Change the server port via environment variable:
```bash
PORT=5000 npm run serve
```

Or edit `server.js`:
```javascript
const PORT = process.env.PORT || 4000;
```

### CORS
By default, all origins are allowed (`*`). To restrict:

Edit `server.js`:
```javascript
app.use(cors({
  origin: ['https://yourapp.com', 'https://staging.yourapp.com'],
  methods: ['GET', 'HEAD', 'OPTIONS']
}));
```

### Cache Headers
Cache durations are configured in `server.js`:
- **Versioned paths** (`/v1/`, `/v0.1.0/`): 1 year (immutable)
- **Latest path** (`/latest/`): 5 minutes
- **Root/catalog**: No cache

## 🌐 Deployment

### Production Deployment

1. **Build components:**
   ```bash
   npm run build
   ```

2. **Deploy to your server:**
   - Upload `dist/` folder and `server.js`
   - Install dependencies: `npm install --production`
   - Start with process manager (PM2, systemd, etc.)

3. **Using PM2:**
   ```bash
   pm2 start server.js --name "secure-ui-components"
   pm2 save
   ```

4. **Using systemd:**
   ```ini
   [Unit]
   Description=Secure-UI Component Server

   [Service]
   ExecStart=/usr/bin/node /path/to/server.js
   WorkingDirectory=/path/to/secure-ui-components
   Restart=always
   Environment=NODE_ENV=production
   Environment=PORT=4000

   [Install]
   WantedBy=multi-user.target
   ```

### Behind a Reverse Proxy (Nginx)

```nginx
server {
    listen 80;
    server_name components.yourcompany.com;

    location / {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # CORS headers (if not handled by Node.js)
        add_header Access-Control-Allow-Origin *;
    }
}
```

### CDN Integration

For best performance, put the server behind a CDN:
- Cloudflare
- AWS CloudFront
- Fastly
- Azure CDN

The server's cache headers will work with CDNs automatically.

## 📊 Monitoring

### Check Server Status
```bash
curl http://localhost:4000/health
```

### View Server Logs
All requests are logged to stdout with timestamps:
```
2026-01-13T19:15:12.949Z - GET /latest/components/secure-input/secure-input.js
```

### Monitor in Production
Use PM2 logs:
```bash
pm2 logs secure-ui-components
```

## 🔐 Security Considerations

1. **HTTPS in Production**: Always use HTTPS when serving components
2. **CORS Configuration**: Restrict origins in production if needed
3. **Rate Limiting**: Consider adding rate limiting for public deployments
4. **Integrity Checks**: Use Subresource Integrity (SRI) hashes in production

Example with SRI:
```html
<script type="module"
  src="http://localhost:4000/v0/components/secure-input/secure-input.js"
  integrity="sha384-hash-here"
  crossorigin="anonymous">
</script>
```

## 🧪 Testing the Server

### Test Component Loading
```bash
# Check if component exists
curl -I http://localhost:4000/latest/components/secure-input/secure-input.js

# Verify CORS headers
curl -I http://localhost:4000/latest/components/secure-input/secure-input.js | grep Access-Control

# Check caching
curl -I http://localhost:4000/v0/components/secure-input/secure-input.js | grep Cache-Control
```

### Test from Browser
```javascript
// Open browser console and run:
fetch('http://localhost:4000/')
  .then(r => r.json())
  .then(catalog => console.log(catalog));
```

## 📝 Notes

- Make sure `dist/` folder exists before starting server (run `npm run build`)
- Server must be running for components to load in consuming applications
- Use versioned URLs (`/v0/...`) in production for cache efficiency
- Use latest URLs (`/latest/...`) in development for always-fresh components

## 🆘 Troubleshooting

### Component Not Found (404)
- Verify `dist/` folder exists: `ls dist/components/`
- Check component name matches exactly
- Run `npm run build` to regenerate dist

### CORS Errors
- Check CORS configuration in `server.js`
- Verify origin is allowed
- Check browser console for specific error

### Port Already in Use
- Change port: `PORT=5000 npm run serve`
- Or kill existing process: `lsof -ti:4000 | xargs kill`

### Components Not Loading
- Check browser network tab
- Verify server is running: `curl http://localhost:4000/health`
- Check Content-Type header is `application/javascript`
