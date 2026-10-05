[![CI](https://github.com/jcarroll95/stickerboards/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/jcarroll95/stickerboards/actions/workflows/ci.yml)
[![Docker image](https://github.com/jcarroll95/stickerboards/actions/workflows/docker.yml/badge.svg?branch=main)](https://github.com/jcarroll95/stickerboards/actions/workflows/docker.yml)

# Stickerboards

A production-deployed social “stickerboard” designed for GLP-1 users to stay consistent with dosing logs, track trends, and maintain motivation through a playful reward loop.

**Live:** https://www.stickerboards.app
**MVP spec:** [`/docs/mvpspec.md`](./docs/mvpspec.md)
**Postman collection:** [`/postman`](./postman)

---

# System Overview

Stickerboards is a full-stack monorepo application built to explore:

- Secure JWT-based auth with RBAC, automatic token refresh and Redis-based blacklisting
- Idempotent transactional reward systems
- Retrieval-augmented LLM insight engine over longitudinal user data and curated medical literature
- Image-heavy UI performance optimization
- Auditability of administrative actions
- Production deployment with observability and backups

The system is intentionally designed beyond CRUD patterns, with strong emphasis on correctness, traceability, and operational discipline.

---

# Architecture

## Monorepo Structure

Organized as an **npm workspaces monorepo**:

-apps/
--api/ -> Node.js + Express REST API
--web/ -> React + Vite SPA


This enables:
- Shared CI/CD pipelines
- Clear frontend/backend boundaries
- Independent dependency scopes
- Deterministic production installs

---

## Architectural Style

Stickerboards follows a **Domain-Oriented Layered Architecture** with separation of concerns and isolated business logic.

### Current Structure

- **Controllers** → HTTP transport layer
- **Usecases** → Core business logic
- **Models (Mongoose)** → Persistence layer
- **Middleware** → Cross-cutting concerns

### Tradeoff: Hexagonal vs Pragmatic Layering

A strict Hexagonal implementation would:

- Use Ports/Interfaces between usecases and persistence
- Use plain domain entities decoupled from Mongoose
- Eliminate infrastructure imports (e.g., `fs`, Mongoose models) from usecases

Current tradeoff:

- Usecases occasionally import Mongoose models directly
- Some domain lifecycle logic lives in Mongoose hooks
- This reduces abstraction overhead and improves iteration speed
- At the cost of full infrastructure decoupling

This decision was made to balance architectural rigor with solo-project velocity while still maintaining testable service boundaries.

A future refactor could introduce repository ports without breaking existing controllers.

---

# Core Engineering Challenges Solved

## 1. Idempotent Sticker Transactions

Awarding and revoking stickers are:

- Keyed by `opId`
- Guarded against double-processing
- Wrapped in MongoDB transactions where appropriate

This ensures correctness under:
- Network retries
- Double-click submissions
- Race conditions

Tradeoff:
- Relies on MongoDB transactional semantics rather than an event-sourced ledger.
- Chosen for implementation simplicity and operational clarity.

---

## 2. Transactional Asset Ingestion

Sticker pack ingestion:

- Validates uniqueness constraints
- Ensures atomic writes
- Prevents duplicate ingestion via transaction boundaries

Tradeoff:
- Uses Mongo transactions instead of asynchronous job queues.
- Simpler operational model for current scale.

---

## 3. Audit Logging

All sensitive operations emit structured audit events:

- Admin inventory changes
- Sticker awards/revocations
- Pack mutations

Audit events provide:
- Traceability
- Operational forensics
- Administrative transparency

Tradeoff:
- Centralized event logging rather than external event stream.
- Simpler infrastructure footprint.

---

## 4. RBAC via JWT Payload

JWT authentication uses:

- JWTs stored in HttpOnly cookies (access token and refresh token)
- Role-based claims embedded in JWT payload (access token)
- Middleware-based authorization checks, automatic refresh
- Redis-backed blacklisting for token revocation

Frontend listens for `auth:unauthorized` broadcast events to gracefully handle session expiry.

Tradeoff:
- JWT-based RBAC over server-side sessions
- Token blacklist minimizes state requirements

---

## 5. Image Optimization Pipeline

The frontend includes a dedicated ingestion pipeline:

- `sharp` for image processing
- Multi-width generation (400w, 800w, 1200w)
- Multi-format output (WebP + PNG)
- `vite-plugin-image-optimizer` for build-time compression

Tradeoff:
- Build-time optimization instead of dynamic CDN transformation.
- Reduces infrastructure complexity at current scale.

---

## 6. LLM-powered insight engine for user trend feedback

Stickerboards periodically examines longitudinal user behavior against curated medical literature to offer users insights about how reported behaviors may align with peer-reviewed conclusions about weight loss. This presents several challenges:

- The system must reliably avoid giving medical advice or the appearance thereof
- LLM-originated insights must not be exploitable by user action to produce unsafe information
- Commercial API access must be secure and durable against abuse
- Curated medical data must be reasonably chunked while still adding value
- User data is deterministically compressed into numeric trends before it's given to LLM
- LLM output is validated by two-layer safety system before release: programmatic keyword/reference check, and second-model LLM validation. Must pass both for release to user.

Tradeoff:
- Prompting is originated by the server at scheduled intervals and is not available by user demand - less flexible, more secure
- Released insights identify trends, reference medical conclusions in papers without drawing connections - output is less personal, but much safer

# Security & Hardening

- Global rate limiting
- Registration cooldowns
- Account lockout mechanisms
- XSS sanitization middleware
- Mongo query sanitization
- HttpOnly secure cookies
- No root deployment user
- Environment variable isolation per release

Tradeoff:
- Security hardening applied at application level rather than WAF layer.
- Appropriate for VPS-hosted solo deployment.

---

# Observability & Operations

## Monitoring

- **Grafana + Loki** for log aggregation
- Alert rules (e.g., 5 errors in 5 minutes)
- Structured logs for operational clarity
- Rolling file logs accessible via admin dashboard

## Backups

- Nightly `mongodump` from the cluster, pulled by a separate backup host that the cluster has no credentials for
- Media bucket synced the same way

## Deployment

- One container image (API serving the built web app), built by GitHub Actions and pushed to GHCR tagged with the commit SHA
- Runs on a self-hosted k3s cluster behind Cloudflare Tunnel → Traefik; deployment manifests live in a separate infrastructure repo
- Per-app namespace with default-deny network policies; MongoDB replica set and Redis in the same namespace; media in Garage (S3-compatible)
- Non-root container, `/healthz` and `/readyz` probes, graceful shutdown on SIGTERM
- Runtime knobs for the proxy chain and object store: `TRUST_PROXY_HOPS` (2 behind Cloudflare → cloudflared → Traefik), `S3_FORCE_PATH_STYLE=true` for Garage

Tradeoff:
- Self-hosted instead of a VPS or managed PaaS: no hosting bill, and the infrastructure work is the point.

---

# Testing Strategy

## Unit Tests

- Business logic in `usecases`
- Transactional correctness validation
- Audit event emission verification

## Integration Tests

- API route testing against test database
- Auth flow validation
- Idempotency enforcement

## End-to-End Tests

- Playwright-based browser tests
- Auth flows
- Core sticker interactions
- Regression prevention

Tradeoff:
- Focused coverage on high-risk transaction paths
- Not 100% coverage, but strategic coverage on invariants

---

# Project Structure
```
.
├── apps/
│ ├── api/
│ │ ├── controllers/
│ │ ├── middleware/
│ │ ├── models/
│ │ ├── usecases/
│ │ └── server.js
│ └── web/
│ ├── src/
│ │ ├── components/
│ │ ├── store/
│ │ └── services/
│ └── optimize-images.js
├── docs/
├── scripts/
└── package.json
```

---

# Local Development

## Prerequisites

- Node.js >= 18
- MongoDB

## Setup

```bash
npm install
npm run dev
npm test
```

## Manual image optimization
```bash
npm run optimize-images -w stickerboards-web
```

## License: MIT
