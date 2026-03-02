# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| Latest release | Yes |
| Previous releases | Best effort |

## Reporting a Vulnerability

We take security seriously. If you discover a security vulnerability in ContextCypher, please report it responsibly.

### Preferred: GitHub Security Advisories

1. Go to the [Security Advisories page](https://github.com/Threat-Vector-Security/contextcypher/security/advisories)
2. Click "Report a vulnerability"
3. Provide details about the vulnerability

### Alternative: Email

Send details to **security@threatvectorsecurity.com**

### What to Include

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### What to Expect

- **Acknowledgment**: Within 48 hours
- **Assessment**: We will evaluate severity and impact within 1 week
- **Fix Timeline**: Based on severity:
  - Critical: Patch within 72 hours
  - High: Patch within 1 week
  - Medium: Patch within 2 weeks
  - Low: Included in next release

### Please Do Not

- Open public GitHub issues for security vulnerabilities
- Exploit vulnerabilities beyond what is needed to demonstrate the issue
- Access or modify other users' data

## Security Design Principles

ContextCypher is designed with these security principles:

- **Offline-first**: Data stays local by default. No cloud dependency required.
- **Local API keys**: AI provider keys are stored locally and never transmitted to our servers.
- **CORS restricted**: In standalone mode, CORS is restricted to localhost origins.
- **Rate limiting**: All API endpoints are rate-limited.
- **Input sanitization**: All diagram data is sanitized before AI processing.
- **No telemetry**: The open-source version contains no analytics or telemetry.
- **Zero trust**: No implicit trust between components. All inputs validated.

## Dependency Security

We monitor dependencies for known vulnerabilities. If you notice a vulnerable dependency, please report it through the channels above or open a standard GitHub issue.
