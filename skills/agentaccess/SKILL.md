---
name: agentaccess
description: Danske tjenester → tjek AgentAccess (agentaccess.dk) FØRST for API/MCP/automation. Open-source/local-first MCP-stak (FastMCP-TS/Inspector/Playwright-MCP/Crawl4AI/Har2MCP), adgangshierarki og Grundfast-MCP. Brug ved hver integration med dansk tjeneste eller tjeneste uden API.
---

# AgentAccess — dansk tjeneste-adgang & lokal MCP-byggestak

**Hovedregel 1:** DANSK tjeneste → tjek **https://agentaccess.dk** (directory + `/enablers`) FØR der bygges noget selv. Sitet er agent-nativt: ethvert sidenavn som `.md`, `llms.txt`-sitemap, `/mcp` JSON-RPC, `/api/openapi.json`, SPARQL/RDF.

**Hovedregel 2 (hård):** **Open-source og lokalt frem for alt andet.** Ingen abonnementer, ingen betalte API'er, ingen "free credits then pay", ingen cloud-afhængigheder i stakken. Model-adgang er den ENESTE betalte komponent.

## Adgangshierarki (beslutningstræ — alle gratis/lokale)

```text
Officiel MCP findes            → brug den (fx Dineros mcp.dinero.dk; Grundfast gf_test_-sandbox)
OpenAPI/spec findes            → OpenAPI MCP Proxy: spec → MCP (IKKE PrintingPress — freemium)
Ingen docs, men netværks-API    → Har2MCP: Chrome DevTools-HAR → generér MCP
Prædikabelt DOM / explorering  → Playwright MCP (modellen styrer browseren selv —
                                  ingen ekstra LLM-omvej som Stagehand kræver)
Viden-indhentning i stor skala → Crawl4AI self-hosted (Docker-API, forbruges fra TS)
Kun menneske-auth (MitID!)     → browser i brugerens session + HITL-gate — ALDRIG credentials
```

## Den lokale nul-cost stak (CC + GLM + TS, model-uafhængig)

```text
                    Claude Code → GLM-5.3[1m]
        skills (SKILL.md) · subagents (.claude/agents) · MCP
                              │
     Playwright MCP (browser) · Crawl4AI (web→MD) · egne MCP'er (FastMCP TS + Zod)
                              │
                        Har2MCP (HAR→MCP)
```

**De seks der installeres (alt OSS, alt lokalt):**

1. **FastMCP TS** — `@prefecthq/fastmcp-ts` (Apache-2.0): FastAPI-agtig MCP-udvikling. Forveksl IKKE med forældet `fastmcp`-npm-pakke. Lav-niveau-kontrol → `@modelcontextprotocol/server` v2 (serveStdio/registerTool, Zod via Standard Schema)
2. **MCP Inspector** — `npx @modelcontextprotocol/inspector` (MIT): interaktiv test/debug af alle MCP'er; altid i dev-loopet
3. **Playwright MCP** — browser-adgang; modellen navigerer/klikker/ekstraherer selv
4. **Crawl4AI** — self-hosted web→ren Markdown (bedste gratis Firecrawl-alternativ; Python-kerne, kør Docker-API'en og forbrug fra TS)
5. **Har2MCP** — HAR-captures → MCP-værktøjer til reverse-engineerede portaler
6. **BAML** — typede LLM-funktioner (Apache-2.0) — når selvstændige TS-agenter skrives

**Senere ved reelt behov (stadig OSS/self-host):** Spider (Rust-crawler), Steel self-hosted (Apache-2.0), Langfuse self-hosted (tracing), Supergateway (stdio→SSE), Firecrawl self-hosted Docker (AGPL — men foretræk Crawl4AI).

**Fjernet fra stakken (betalt/freemium/cloud):** PrintingPress, Exa, Tavily, Browserbase, AgentQL, E2B, Jina Reader (convenience højst), Daytona, Stagehand (kræver ekstra LLM-kald — Playwright MCP er renere når GLM alligevel er hjernen).

## Relevante danske entries (uddrag)

- **Dinero-MCP** (officiel beta) · **Pleo-MCP** · **MobilePay** dev-API · **MitID: menneske-auth only — ingen API**
- **Grundfast-MCP**: `api.grundfast.dk/mcp` — 12 tools på BBR/Matriklen/DAR/CVR/DHM/GeoDanmark; gratis `gf_test_`-sandbox
- **Statistikbanken** (2.000+ DST-datasæt) · **Datafordeler** · **DAWA** · **Energidataservice** · **Rejseplanen**
- `/topics` (CVR, DAWA, DMI, Energinet) · `/sector-{government,finance,…}` · `/for/*` framework-guides

## Arbejdsregler

1. Dansk tjeneste → `WebFetch agentaccess.dk/<tjeneste>.md` før egen kode
2. Mangler API → hierarkiet ovenfor i rækkefølge; Har2MCP førstevalg til reverse-engineerede portaler (referencecase: Dineros fil-link-rute)
3. Nye MCP'er: TS/Bun + Zod + Inspector-test — referenceimplementering: `dinero-mcp` (~/dev/dinero-auto/src/mcp.ts)
4. Installér kun ved reelt behov — hver komponent øver agent-infrastruktur-overfladen
5. Tredjeparts-skills/plugins/MCP: `skill-security-review` på eksakt kilde før install
