# betterEatBetter-server

## Backend Impact

### Architecture

The backend follows a clean structure: `domain -> use-cases -> ports -> adapters -> http`.
Dependency direction always points inward, so business logic does not know about Prisma, HTTP, Redis, storage, or which LLM/provider is behind an adapter.

Impact:
- lower coupling between product logic and infrastructure
- easier provider swaps and safer refactors
- simpler unit testing because core logic is isolated

### Food Recognition
<img width="43441" height="5234" alt="food-recognition_approach" src="https://github.com/user-attachments/assets/7cb5a0b6-ebab-4463-9e09-459b68e3a84a" />


Food recognition uses a hybrid approach that separates single-ingredient foods from mixed-ingredient meals.
Single items can be estimated more deterministically, while mixed dishes need more contextual inference.

Impact:
- more consistent nutrition estimates
- fewer obviously wrong outputs
- better handling of real-world meal photos

Barcode recognition is also used as a fast, structured path for food lookup, with Redis caching to avoid repeated external calls.

Impact:
- lower latency for repeat lookups
- reduced external API cost and rate-limit pressure
- more deterministic results than image-based estimation when a barcode is available

### Chatbot UX

The chatbot is used as a UX layer for meal logging, not just as a text-generation feature.
Instead of forcing users through rigid forms, it lets them log meals conversationally and maps that input into structured nutrition data.

Impact:
- lower logging friction
- higher chance that users actually complete meal logging
- more natural product experience without losing backend structure

### Technical Decisions

Queue jobs use deterministic `jobId` values such as `mealPhotoId`.
This makes retries and duplicate submissions idempotent at the queue layer.

Impact:
- duplicate work is avoided
- side effects are less likely to run twice
- queue operations are easier to reason about operationally

The photo upload flow uses direct-to-storage upload and a `copy`, not `move`, from `pending/` to final storage.

Impact:
- Node does not become a binary file bottleneck
- race conditions between workers are avoided
- storage flow is cheaper and more reliable at scale

### Observability

The backend propagates `x-trace-id` across mobile, Node, queues, and Python.
Inside Node, `AsyncLocalStorage` carries trace context automatically, but queued jobs explicitly carry the trace ID in the payload and restore it in the worker.

Impact:
- a single user action can be traced end to end
- debugging cross-service failures is much faster
- queue boundaries do not silently break trace visibility

Structured logs and queue/job metrics are treated as part of correctness, not as an afterthought.

Impact:
- incidents are easier to diagnose
- latency and failure hotspots are visible earlier
- retryable vs non-retryable failures are easier to separate

### Testing

Testing is split by failure boundary:
- unit tests for domain rules and use-cases
- integration tests for Prisma, Redis, storage, and queue behavior
- contract tests for external AI response shapes
- end-to-end tests for complete user flows

Impact:
- faster root-cause isolation when something breaks
- better confidence on external integration boundaries
- lower risk of regressions in critical flows like food recognition and meal logging
