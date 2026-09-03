# Zod → JSON Schema → OpenAPI → Postman

Reference for [klh-zod-validation](../SKILL.md): the schema-boundary side of the skill — turning the validators you already run at runtime into published contracts. One source of truth; never hand-maintain a second schema.

## Tier 1 — JSON Schema (native, zero deps)

Zod ≥4 converts any schema via `z.toJSONSchema()` (correctness-hardened in 4.5):

```typescript
import { z } from "zod";

const UserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  role: z.enum(["admin", "user"]).default("user"),
});

const jsonSchema = z.toJSONSchema(UserSchema, {
  target: "draft-2020-12", // default; "draft-7" available
  io: "output", // "output" (default) = post-parse shape; "input" = what parsing accepts
  metadata: z.globalRegistry, // .register()'ed id/title/description land here
  unrepresentable: "throw", // "throw" (default) | "any" — z.never() etc have no JSON Schema form
});

// Loop schemas: z.toJSONSchema() on schemas with cycles → define $defs once:
const jsonSchema = z.toJSONSchema(OrderSchema, {
  reused: "ref",
  target: "draft-2020-12",
});
```

- Register metadata: `z.globalRegistry.add(UserSchema, { id: "User", title: "User" })` → clean `$ref`s.
- `io: "input"` vs `"output"` matters when defaults/transforms/coercions exist — pick per contract need.
- JSON Schema out of zod is **draft-2020-12 or draft-7** — fine for config/docs, NOT a full REST contract.

## Tier 2 — OpenAPI documents (@asteasolutions/zod-to-openapi)

For real API docs (paths, params, responses, auth) use the registry pattern:

```typescript
import {
  OpenAPIRegistry,
  OpenApiGeneratorV3,
} from "@asteasolutions/zod-to-openapi";

const registry = new OpenAPIRegistry();
registry.registerComponent("securitySchemes", "bearerAuth", {
  type: "http",
  scheme: "bearer",
});

registry.registerPath({
  method: "get",
  path: "/users/{id}",
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: {
      description: "The user",
      content: { "application/json": { schema: UserSchema } },
    },
  },
});

const spec = new OpenApiGeneratorV3(registry.definitions).generateDocument({
  openapi: "3.0.3",
  info: { title: "API", version: "1.0.0" },
  servers: [{ url: "https://api.example.com" }],
});
```

Rules of thumb:

- V3 (`OpenApiGeneratorV3`) for widest tooling; V31 if you want JSON Schema 2020-12 fidelity.
- One `registerPath` per endpoint, co-located with its route handler — the registry aggregates.
- Reuse the SAME schema instance across paths; the generator dedupes into `components/schemas` via `registry.register()`.
- Emit + verify in CI: write `openapi.json`, `jq empty` it, diff against previous to catch accidental contract changes.

## Tier 3 — Postman

Postman imports OpenAPI directly — don't generate Postman collections separately. Postman → Import → the `openapi.json` (or URL). Collection variables map to the spec's servers/auth. The dinero-regnskab skill is the reference pattern for vendoring a third-party spec the same way.

## Reverse direction (spec → zod)

- Exploring/verifying an EXISTING API: read the vendored OpenAPI (`jq '.paths | keys[]' spec.json`) — don't generate zod from it unless you must mock it.
- If mocks are needed: generate TS types from the spec (`openapi-typescript`) and validate at runtime with hand-written zod for the endpoints you consume — generated-from-generated validators inherit spec bugs silently.

## Decision table

| Need                             | Use                                               |
| -------------------------------- | ------------------------------------------------- |
| Config/docs/JSON-Schema consumer | `z.toJSONSchema()` — native, no deps              |
| REST API contract, public docs   | `@asteasolutions/zod-to-openapi`                  |
| Postman collection               | Import the OpenAPI doc — never hand-build         |
| Hot-path parsing                 | `z.compile(schema)` (Zod 4.5) + validators above  |
| Contract drift detection         | emit spec to file, `difft` against previous in CI |

## Verification

- `z.toJSONSchema` on a schema with `.default()`/transforms: assert `io` choice matches what consumers expect (the #1 silent mismatch).
- Generated spec: `jq empty openapi.json` + validate against OpenAPI schema (`@apidevtools/swagger-parser validate` or editor.swagger.io).
- Round-trip sanity: `safeParse` a known-good payload AND a known-bad payload against the same schema that generated the doc.
