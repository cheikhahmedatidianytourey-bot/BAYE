# BAYE Media Model Integration & Reality-Fidelity Evaluation

## Objective

Prepare BAYE Motion for real, repeatable integration tests against external image/video generation models. The long-term target is photorealistic output that can be visually indistinguishable from real capture in appropriate conditions—not a claim that today's connected models achieve that.

## Current implementation snapshot (verified in repository)

- Image generation: Cloudflare Workers AI, `@cf/black-forest-labs/flux-1-schnell`, direct request adapter, image returned as data URI.
- Video generation: fal.ai queue, `fal-ai/kling-video/v2.1/standard/text-to-video`, submission and status/result polling.
- Image-to-video input: optional public HTTPS image URL validated before use.
- Frontend: BAYE Motion sends image/video requests and displays results.
- Provider credentials: server-side only; image uses Cloudflare account/token; video uses `FAL_KEY`.
- Current setup is an initial integration—not a model-comparison platform, nor evidence of near-real-world photorealism.

## Integration principles

1. Keep provider credentials on the backend; never expose secrets to browser code, logs, or generated artifacts.
2. Providers and model identifiers must be configurable, not hard-coded into product logic.
3. Do not silently switch to a paid provider/model or trigger billing. Require explicit configuration and disclose cost/limits.
4. Provider failures, timeouts, queue states, incomplete outputs and malformed responses must be handled explicitly.
5. Preserve request IDs and safe metadata for repeatable evaluation; avoid storing sensitive prompts or media by default.
6. Clearly label synthetic media. Evaluation must not be represented as certification or a guarantee of realism.

## Proposed staged work

### Stage 1 — Adapter contracts and test harness (next implementation)
- Define normalized image/video request, status and result contracts.
- Test adapters using injected/mock fetch implementations; no credentials or provider charges in CI.
- Verify validation, timeouts, error mapping, response size bounds, URL validation, queue polling, result parsing and secret redaction.
- Build deterministic test fixtures and a versioned evaluation prompt set.

### Stage 2 — Real provider experiment (manual, opt-in)
- Configure credentials securely on the deployment or a controlled test environment.
- Run a small, budget-capped set of prompts; manually approve each paid request.
- Store provider/model/version, prompt category, parameters, latency, errors, and cost estimates where available. Store media only with explicit retention choice.
- Compare candidates using identical prompt and parameter conditions where possible.

### Stage 3 — Candidate model expansion
- Evaluate higher fidelity image and video candidates from multiple providers, using current availability, access requirements, licensing, safety controls, and price.
- Add provider-specific adapters behind a common contract; avoid choosing a winner based solely on vendor claims.
- Test image generation, image editing, reference-image conditioning, text-to-video, image-to-video, duration, resolution and consistency only where models support these features.

### Stage 4 — Quality evaluation
Score each result independently (with human review; automated scores are auxiliary):
- Prompt adherence and scene completeness
- Photorealism: lighting, shadows, optics, material detail, natural skin/hair, textures
- Physical plausibility: motion, contact, gravity, fluid behavior, reflections
- Temporal consistency: subject identity, objects, environment and camera motion across frames
- Artifact rate: hands/anatomy, geometry, text, flicker, warping and frame discontinuities
- Resolution, duration, latency, reproducibility, cost, content controls and accessibility

Use a documented rubric with blind human comparisons and repeated trials. Scores should reflect actual output, not model marketing or a single lucky sample.

### Stage 5 — BAYE Motion user experience
- Display the actual provider and model used, generation state, and meaningful failure messages.
- Offer progress tracking and bounded polling.
- Enable saved results, download and comparison only with secure storage, retention controls and usage policy.
- Protect against abuse, unexpected costs, oversized outputs, malicious URLs and provider-specific payloads.

## Initial benchmark prompt categories

Create versioned prompts spanning:
1. Natural landscapes, weather and water.
2. Close-up materials (glass, metal, fabric, skin, hair).
3. People and everyday motion, with appropriate safeguards.
4. Animals and complex anatomy/motion.
5. Architecture, interiors and perspective.
6. Vehicles and moving mechanical components.
7. Physics interactions (pouring, collisions, smoke, wind).
8. Multi-shot continuity and reference-image consistency.
9. Night scenes, shadows, reflections and mixed lighting.
10. Exact prompt constraints and object counts.

## Acceptance gates

- Unit and contract tests pass without external network calls or real credentials.
- No credential leakage in response payloads or logs.
- Cost-bearing integration tests remain opt-in and budget-controlled.
- Evaluation results distinguish provider/model capability from BAYE orchestration.
- No claim of photorealism parity without documented evidence and blind human evaluation.
