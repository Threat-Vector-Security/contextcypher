# Feature Deep Dive: Data Sanitization Filter (Pro)

> Available in: **Pro** & **Enterprise** editions  |  Default: **Off**

AI Threat Modeler can optionally scrub sensitive information — such as IP addresses, email addresses, passwords, API keys, internal host-names, and company names — from every prompt that is sent to **public cloud** language-model providers (OpenAI, Anthropic Claude, Google Gemini, …).  
When you work in **Local LLM** mode the filter is bypassed so the model receives the full, unmodified context.

---

## 1  What gets sanitised?

| Data type                          | Example                        | Replacement      |
|------------------------------------|--------------------------------|------------------|
| IPv4 / IPv6 addresses              | `10.1.2.3`, `2001:db8::1`      | `x.x.x.x`        |
| E-mail addresses                   | `alice@corp.internal`          | `[EMAIL]`        |
| Password-like tokens               | `password123`, `Pa$$w0rd!`     | `[REDACTED]`     |
| API / secret keys                  | `api-key-9f3e1`                | `[REDACTED]`     |
| AWS Access Keys                    | `AKIA1234567890123456`         | `[REDACTED]`     |
| OpenAI-style keys                  | `sk-proj-abc123...`            | `[REDACTED]`     |
| Long tokens (40+ chars)            | Base64-like strings            | `[REDACTED]`     |
| Company keywords*                  | `acme`, `corp`, `technologies` | `COMPANY`        |

*Note: Company keyword matching is currently limited to these hardcoded patterns (case-insensitive). Custom company names will be supported in a future version.

The same patterns are applied to both your **chat messages** and the **diagram metadata** (node labels, descriptions, connection labels, custom context, …).

---

## 2  How it works under the hood

1. You enable the toggle in **Settings → General → Data Sanitization**.
2. When the current AI mode is **Public** (OpenAI / Anthropic / Gemini):
   1. The client-side `DiagramSanitizer` replaces all sensitive matches in:
      * the user’s message,
      * `customContext`,
      * every node/edge label & description.
   2. A `metadata.isSanitized = true` flag is attached to the request so the backend can trust the payload.
3. The cleaned-up prompt is forwarded to the selected provider.
4. In **Local** LLM mode the sanitizer is **skipped** so your private model receives the verbatim data.

The entire operation happens **locally** inside the desktop application — no data ever leaves your machine during the sanitization process.

---

## 3  Enabling the filter

1. Unlock the feature with a Pro / Enterprise licence key.
2. Open **Settings → General → Data Sanitization Filter**.
3. Flip the **Enable Data Sanitization** switch.
4. Switch to any public provider (OpenAI, Anthropic, Gemini) and send a test question — placeholders (`x.x.x.x`, `[EMAIL]`, …) will appear in the prompt snapshot shown in the logs.

> Tip: Combine this feature with **Chat History Logging** to keep an audit-friendly, redacted record of every request and response.

---

## 4  Limitations & caveats

* The replacement rules are **pattern-based**; extremely unusual formats could slip through.
* Sanitisation may remove version numbers or port information that could be relevant for certain security assessments — disable the filter temporarily if you need full fidelity.
* The filter currently operates in English; non-ASCII hostnames / emails are partially supported via Unicode categories but not guaranteed.

Future versions may include:
* Custom company names and patterns
* Support for internal hostname patterns  
* A "Preview Sanitised Prompt" button directly in the Analysis panel
* Automatic re-injection of the redacted fields into analysis results/exports for internal use 

## 5  User feedback when redaction occurs

When the filter makes any replacement on the **client**, a small info toast appears in the Analysis panel:

```
sensitive: 3, business: 1
Sensitive data was redacted — consider removing it from the diagram or custom context.
```

The counts map directly to the replacement categories reported by the sanitiser (`sensitive`, `business`, `technical`).  The toast disappears after 6 seconds or can be dismissed manually.

## 6  Backend enforcement

All threat-analysis requests that originate exclusively on the server side (e.g. **SimplifiedThreatAnalyzer**) are passed through the same `sanitizeText()` helper whenever the current provider is NOT `local`.  This guarantees that no sensitive tokens slip through even if a legacy client skips sanitisation.

---
*Document updated: clarified company name patterns and removed unsupported features (2025-08-04).* 