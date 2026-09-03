---
name: dinero-regnskab
description: Automatiser Visma Dinero-bogføring via browser (Playwright/CDP) — opret/slet bilag, momskoder, kontoafstemning, moms- og EU-salg-indberetning. Brug når opgaven nævner Dinero, bogføring, momsangivelse eller regnskabsafstemning.
---

# Dinero-bogføring via browser-API

## Setup (engangs pr. session)

1. Start vedvarende Chromium med CDP: `"$(fd 'Google Chrome for Testing' ~/Library/Caches/ms-playwright -t f -d 6 | head -1)" --user-data-dir=/tmp/dinero-profile --remote-debugging-port=9222 --no-first-run "https://dinero.dk"` (playwright-chromium: `~/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`)
2. `npm --prefix /tmp/dinero-auto install playwright` (engang) — scripts kører med `node /tmp/dinero-auto/*.mjs`
3. Bruger logger selv ind (Google/Visma + MitID) → bekræft med `chromium.connectOverCDP('http://localhost:9222')` og find siden `app.dinero.dk/{orgId}/...`
4. Alt API-kald sker via `page.evaluate(fetch('/api/...', {credentials:'include'}))` — cookie-auth følger browseren

## Intern API-oversigt (org 408818 eksempel)

| Handling | Endpoint |
|----------|----------|
| Købsbilag | `POST /api/{org}/{periode}/vouchers/purchase/v2` → `POST /vouchers/{id}/book/{ts}` |
| Finansbilag | `POST /api/{org}/{periode}/vouchers/manuel/v2` (auto-booker tit; ellers `POST /vouchers/manuel/{id}/book/{ts}`) |
| Skabelonbilag (hævet/indskudt/overførsel/rente) | `POST /api/{org}/{periode}/vouchers/templates/{type}` → `.../{id}/{ts}/book` |
| Bogført bilag slettes | `DELETE /api/{org}/{periode}/vouchers/manuel/{id}/{ts}` (skabelon) eller `/vouchers/purchases/cash/{id}/{ts}` (køb) |
| Voucherliste | `GET /api/{org}/{periode}/accounting/vouchers?...` — **filtrér på voucherDate-år: numrene starter forfra hvert regnskabsår!** |
| **Fil-upload til bilagsarkiv** | `POST /api/filearchive/v1/organizations/{org}/files/upload?source=web` (multipart, felt `file`) → svarer `[{"fileId","fileGuid"}]` |
| **Fil ↔ bilag-link** | `POST /api/{org}/{periode}/voucherfile/{voucherId}/{ts}` body `{"fileGuid":"..."}` — ts fra GET på voucher (manuel- ELLER purchases/cash-rute). **IKKE via PUT fileGuid (500'er)** |
| Kontospecifikation | `GET /api/{org}/{periode}/accounts/{accountId}/entries` |
| Beholdninger/konti | `GET /api/{org}/{periode}/deposits` (deposit-id ≠ account-id!) |
| Kontoplan | `GET /api/{org}/{periode}/accounts?page=0&pageSize=500` (felt `number`, ikke accountNumber) |

## Kritiskeenheds- og feltregler

- **Køb**: beløb i kroner med decimaler; linjer `{description, total, accountId, vatCode}`; kræver `regionKey` der matcher momskode (**DK | EU | World**) + `depositId` + `voucherType:'Cash'`
- **Skabeloner**: `amount` i **kroner** (IKKE øre — UI-formularen viser øre i request, API'et tolker kroner!). `privatedeposit` kræver `toDepositAccountId`; `interestexpense` kræver `interestType:'bankexpense'`
- **Finansbilag**: linje-konto DEBIT, modkonto kredit med modsat fortegn; `accountId` + `balancingAccountId`; moms via `vatTypeId` (5211081=EU-salg ydelser, 5211084=EU-varer m.fl fra accounts.json `defaultVatTypeId`)
- **Momskoder (vatCode)**: `I25` dansk købsmoms · `IEUY` EU-ydelseskøb · `IEUV` EU-varekøb · `IVY` verden-ydelse · `IVV` verden-vare · `null` uden moms
- **Konto-begrænsninger**: købsbilag afviser anlægskonti (51020/51497) → anlæg bogføres som finansbilag (Dr 51020/Kr beholdning). Negative købsbeløb afvises → refusioner som finansbilag eller kreditnota
- UI-formularer: beløb med **komma**-decimaler ('36729,22' ≠ '36729.22'); dropdowns = `.dinero-select-item` efter søgning, eller piletaster + Enter (options kan være usynlige i DOM!)

## Fejlfinding

- **500 "Prøv igen" ved slet/redigering af skabelonbilag**: sker når bilagets record er PUT-rettet så den afviger fra posterne. Løsning: PUT `amount` tilbage til den bogførte værdi (typisk ×100) → DELETE virker nu
- **Drafts der ikke poster**: manuel/v2 opretter tit kladde — altid verificér status og book med `/book/{ts}` (ts sidst i URL'en!)
- **Overlay blokerer klik**: brug `page.mouse.click(boundingBox)` eller DOM `.click()` i stedet for locator.click
- **Deposits-total vs ledger**: deposits-API kan cache/vække primobalancer — brug altid accounts/{id}/entries som sandhed

## Workflow: fuld regnskabsafstemning

1. Kontoudtog (PDF → `pdftotext -layout`; Danske Bank-linjer ender med usynligt `` — strip med `re.sub(r'[-\s]+$', '', line)`)
2. Generér CSV fra PDF med kontrolsum (slut- udstartsaldo = sum af beløb)
3. Kategorisér hver linje: DK-moms / EU / verden / uden moms / privat-hævet / overførsel / løn / ejerlån
4. Bogfør køb → skabeloner → finansbilag (kurstab: modkonto = valutakonto)
5. **Verificér**: ledger-sum pr. konto mod kontoudtog-slutsaldo — différ pr. beløb (`Counter`-match) for at finde dubletter/missing
6. Moms: `/vatreports` → tjek rubrikker → "Overfør til skat.dk" (MitID = brugerens del)
7. EU-salg uden moms (VIES): samme momsnummer = ÉN linje pr. kvartal (flere linjer med samme nr. = fejl); beløb i hele kroner; sum skal matche rubrik B præcist
8. Refusion/udbetaling: bogfør først når pengene rammer kontoen ("Bogfør momsbetaling" med faktisk dato)

## Regnskabsregler notater (DK, selvstændig/aps)

- Selvstændig: "løn"-hævninger uden A-skat/AM-bidrag → ejerregnskab (60140/60160)
- Straksafskrivningsgrænse 2026: 36.000 kr ekskl. moms — derover: anlæg + afskrivning
- Erhvervsrejse: egen billet fradragsberettiget ved erhvervsmæssigt formål; ledsagende familie = altid privat
- Reverse charge: salg til EU-virksomhed (B-ydelser) = 0% moms men skal i angivelse + VIES; køb med EU/verden-koder selvberegner moms der netter 0
- Flybilletter international = momsfrie; refusion fra SKAT = ind-post på bank (Dr Bank/Kr 64100)
- Kursdifference: realiseret tab på valutakonto bogføres som finansiel udgift mod valutabeholdningen
