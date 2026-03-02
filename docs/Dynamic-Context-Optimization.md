# Dynamic Context Management (July 2025)

The AI Threat Modeler now feeds each language-model the **maximum context its window allows** — no more hard-coded 8 k / 32 k clamps.  The only optimisation still in place is lightweight message-history compaction when we approach the window size.

---
## 1 · Context-Window Discovery

1. When the user selects or saves a local Ollama model the backend issues
   `/api/ollama/model-info/:modelName` → Ollama `POST /api/show`.
2. The returned `context_length` (aka `num_ctx`) is stored as `contextWindow` for that provider.
3. Every request to `/api/chat` (streaming or not) adds
   ```jsonc
   {
     "options": {
       "num_ctx": <contextWindow>,   // e.g. 131072 for llama3.1-8b
       "num_predict": <maxTokens>    // user-chosen output limit, default 4096
     }
   }
   ```
4. Cloud providers keep static tables (GPT-4 = 128 k, Claude = 200 k, Gemini = 1 M, …).

## 2 · Context Assembly Pipeline

1. **System Prompt** – role definition and behaviour rules.
2. **Task Block**     – the user’s latest request (e.g. “Analyse the diagram”).
3. **Diagram Block**  – full Cypher graph (≈ 80 % smaller than JSON).
4. **Custom Context** – user notes, threat-intel, drawings, etc.
5. **Message History** – recent turns; older ones summarised on demand.

The single helper `server/utils/context-optimizer.js` builds this structure for *all*
endpoints, guaranteeing identical behaviour in chat and one-shot analysis.

## 3 · Message-History Compaction

If estimated tokens ≥ 80 % of `contextWindow`:
* newest 4 messages kept verbatim;
* middle messages compressed to ≈ 50 % size;
* oldest messages folded into a chronological synopsis.

No diagram or custom context is ever removed.

## 4 · Token Estimation

```
estimateTokens(text)         = ceil(text.length / 3.5)
estimateObjectTokens(object)  // structure-aware recursion
```
The estimator deliberately over-counts a little to stay below hard limits.

## 5 · Provider Defaults (post-discovery)

| Provider   | Window detected | `num_predict` (default) |
|------------|-----------------|-------------------------|
| Ollama     | *dynamic* (model-info) | 4096 |
| GPT-4-o     | 128 k | 4096 |
| Claude 3   | 200 k | 4096 |
| Gemini 1.5 | 1 M   | 8192 |

All values can be overridden in **Settings → Model Configuration**.

---
### Changelog
* 2025-07-24 — Rewrote document to reflect the removal of legacy 8 k/32 k clamps and the switch to dynamic context-window detection.*
