# CodeQL Security Scanning Fixes

This document describes the security remediations applied for CodeQL alerts in the backend and frontend.

---

## 1. Server-Side Request Forgery (SSRF)
**Alert IDs:** #29, #30, #31, #32, #33, #34, #35, #36, #37, #38, #39  
**Severity:** Critical  
**Locations:** `server/index.js`, `server/aiProviders.js`, `server/utils/ollamaUrl.js`

### The Vulnerability
The application accepted a user-configurable Ollama `baseUrl` and used it directly in outbound `fetch()` / `axios` calls.

### The Remediation
A shared URL hardening utility was introduced in `server/utils/ollamaUrl.js`:

```javascript
const { safeOllamaUrl, validateOllamaBaseUrl } = require('./utils/ollamaUrl');
```

`safeOllamaUrl(baseUrl, endpointPath)` now enforces:
- valid URL parsing
- only `http:` / `https:` schemes
- no embedded credentials in URL
- host allowlist enforcement (default: `127.0.0.1`, `localhost`, `::1`)
- endpoint path must start with `/api/`

Additional hosts can be explicitly allowlisted with:
- `OLLAMA_ALLOWED_HOSTS=host1,host2,...`

All Ollama network calls now use `safeOllamaUrl(...)` directly (no insecure fallback to raw string interpolation).

### Why this mitigates risk
The server now rejects unsafe hosts and malformed URLs before any outbound request is made, preventing untrusted URL injection into request sinks.

---

## 2. Insecure Randomness
**Alert IDs:** #40, #41, #42, #43, #44  
**Severity:** High  
**Locations:** `server/index.js`, `src/services/ChatHistoryLogger.ts`, `src/services/ThreatAnalysisLogger.ts`

### The Vulnerability
`Math.random().toString(36)` was used for request/session identifiers.

### The Remediation
Replaced insecure PRNG calls with CSPRNG-backed APIs:
- Backend: `crypto.randomBytes(...).toString('hex')`
- Frontend: `crypto.randomUUID()`

### Why this mitigates risk
IDs now come from cryptographically secure entropy sources, removing predictability from identifier generation.

---

## 3. Uncontrolled Data Used in Path Expression (Path Traversal)
**Alert IDs:** #45, #46, #47, #48  
**Severity:** High  
**Location:** `server/index.js`

### The Vulnerability
`diagramId` flowed into filesystem paths.

### The Remediation
`sanitizeDiagramId(id)` is now strict and reject-based:

```javascript
function sanitizeDiagramId(id) {
  if (!id || typeof id !== 'string') return null;
  const trimmed = id.trim();
  if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) return null;
  return trimmed;
}
```

The sanitized ID is used consistently for both:
- diagram file reads from `DIAGRAMS_DIR`
- threat intel cache reads from `THREAT_INTEL_DIR`

### Why this mitigates risk
Traversal metacharacters are rejected (not transformed), and only known-safe identifier formats are allowed in path construction.

---

## 4. DOM Text Reinterpreted as HTML (XSS)
**Alert ID:** #50  
**Severity:** High  
**Location:** `src/components/AnalysisChat.tsx`

### The Vulnerability
HTML rendering paths using `dangerouslySetInnerHTML` can execute model-generated script payloads if content is not sanitized.

### The Remediation
Added `DOMPurify` import and sanitization before HTML insertion:

```javascript
import DOMPurify from 'dompurify';

<span dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(messageContent as string) }} />
```

### Why this mitigates risk
Potentially dangerous HTML tags/attributes are removed before content reaches the DOM.

---

## 5. Polynomial Regular Expression Used on Uncontrolled Data (ReDoS)
**Alert IDs:** #51, #52, #53, #54  
**Severity:** High  
**Locations:** `server/aiProviders.js`, `server/services/LangExtractClient.js`, `server/services/MessageCompactionService.js`

### The Vulnerability
Some regex usage operated on unbounded input and/or patterns flagged by CodeQL.

### The Remediation
- `MessageCompactionService.js`:
  - sentence extraction moved to `split(/(?<=[.!?])\s+/)`
  - list matching regex simplified
- `LangExtractClient.js`:
  - domain regex tightened with explicit word boundaries
- `aiProviders.js`:
  - created bounded modelfile string (`substring(0, 5000)`) and applied regex matches against this bounded value

### Why this mitigates risk
Regex execution scope is reduced for large inputs, and matching patterns were adjusted to reduce pathological evaluation behavior.
