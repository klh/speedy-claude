---
name: agentaccess
description: Danske tjenester → tjek AgentAccess (agentaccess.dk) FØRST for API/MCP/automation. Inkluderer adgangshierarki (PrintingPress/Har2MCP/Stagehand), TS-first MCP-stak (FastMCP-TS/Inspector/Firecrawl/Exa) og Grundfast-MCP til offentlige registre. Brug vedenhver integration med dansk tjeneste eller udenlandsk tjeneste der mangler API.
---

# AgentAccess — dansk tjeneste-adgang & MCP-byggestak

**Hovedregel:** Skal en DANSK tjeneste integreres/automatiseres → tjek **https://agentaccess.dk** (directory + `/enablers`) FØR der bygges noget selv. Sitet er agent-nativt: ethvert sidenavn som `.md`, `llms.txt`-sitemap, `/mcp` JSON-RPC-endpoint, `/api/openapi.json`, SPARQL/RDF.

## Adgangshierarki (beslutningstræ)

```text
Officiel MCP findes            → brug den (fx Dineros på mcp.dinero.dk, Visma-OAuth)
OpenAPI/spec findes            → PrintingPress: generér TS-MCP + CLI fra spec
Ingen docs, men netværks-API    → Har2MCP: capture HAR i browser → generér MCP
   (reverse-engineerede portaler)
Prædikabelt DOM                → Playwright (selectorkode)
Rørende/ændrende UI            → Stagehand (act/observe/extract + Zod)
Kun viden skal hentes          → Firecrawl (crawl→Markdown) / Exa (semantisk søgning)
Kun menneske-auth (MitID!)     → browser i brugerens session + HITL-gate — ALDRIG credentials
```

## TS-first stak (model-uafhængig — kører GLM/Claude/GPT)

| Prioritet | Værktøj                                                                                                                                                  | Rolle                                                                                                                                                                |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ★★★★★     | **FastMCP TS** (`@prefecthq/fastmcp-ts`)                                                                                                                 | FastAPI-agtig MCP-udvikling oven på officiel v2-SDK. OBS: forveksl IKKE med den forældede `fastmcp`-npm-pakke                                                        |
| ★★★★★     | **MCP Inspector** (`npx @modelcontextprotocol/inspector`)                                                                                                | Test/debug alle MCP'er interaktivt — altid i dev-loopet                                                                                                              |
| ★★★★★     | **Firecrawl**                                                                                                                                            | Web→ren Markdown/struktur: `claude plugin install firecrawl@claude-plugins-official` eller `claude mcp add firecrawl -e FIRECRAWL_API_KEY=… -- npx -y firecrawl-mcp` |
| ★★★★☆     | **PrintingPress**                                                                                                                                        | OpenAPI/Swagger → genereret TS/Python-MCP (`npx printingpress generate --url … --target mcp-typescript`)                                                             |
| ★★★★☆     | **Stagehand**                                                                                                                                            | LLM-drevet browser-automation (act/extract m. Zod-schema) — foretrækkes over browser-use i TS-stak                                                                   |
| ★★★★☆     | **Exa**                                                                                                                                                  | Semantisk FIND (Exa) vs. LÆS/crawl (Firecrawl) — research(): Exa-søg → Firecrawl-læs                                                                                 |
| ★★★★☆     | **Har2MCP**                                                                                                                                              | `npx har2mcp generate -i traffic.har -o ./foo-mcp` — HAR→MCP-værktøjer                                                                                               |
| ★★★☆☆     | Playwright-MCP (explorativ browser), BAML (typede LLM-funktioner — kun uden for Claude Code), E2B (sandbox til prod-agenter), Langfuse (tracing, senere) |
| ★★☆☆☆     | Browserbase/Steel (hostet flåder), Jina Reader (billig URL→MD: `r.jina.ai/http…`), Supergateway (stdio→SSE)                                              |
| ★☆☆☆☆     | DeepSeek Harness (redundant m. Claude Code)                                                                                                              |

**Lav-niveau-kontrol** → `@modelcontextprotocol/server` (officiel v2: serveStdio/registerTool, Zod/Valibot/ArkType via Standard Schema). **DX** → FastMCP TS. Ingen Anthropic-SDK-afhængighed; LangChain undgås; Mastra først ved selvstændige agenter uden for harness.

## Relevante danske entries (uddrag)

- **Dinero-MCP** (officiel beta, mcp.dinero.dk) · **Pleo-MCP** · **MobilePay** dev-API · **MitID: menneske-auth only — ingen API**
- **Grundfast-MCP**: `https://api.grundfast.dk/mcp` — 12 tools på BBR/Matriklen/DAR-adresser/CVR/DHM/GeoDanmark; gratis sandbox-nøgle `gf_test_…` (Authorization-header)
- **Statistikbanken** (DST 2.000+ datasæt) · **Datafordeler** · **DAWA** (geodata) · **Energidataservice** · **Rejseplanen**
- Topics-tove: `/topics` (CVR, DAWA, DMI, Energinet) · sektorer: `/sector-{government,finance,transport,…}`

## Arbejdsregler

1. Dansk tjeneste → `WebFetch https://agentaccess.dk/<tjeneste>.md` (eller `/directory`) før egen kode
2. Mangler API → prøv hierarkiet ovenfor i rækkefølge; Har2MCP er førstevalg til reverse-engineerede portaler (fx interne browser-API'er)
3. Nye MCP'er bygges i TS (Bun) med Zod + Inspector-test — se `dinero-mcp` (~/dev/dinero-auto/src/mcp.ts) som referenceimplementering
4. Tredjeparts-skills/plugins/MCP: kør altid `skill-security-review` på eksakt kilde før install
