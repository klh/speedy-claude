// llm-keepwarm.ts — ONE keepwarm pass over the resident fleet, then exit.
// launchd (com.klh.llm-keepwarm) re-runs this every 4 min. Purpose: MLX
// weights page out after idle → ~50s first-touch stall; a 1-token generation
// keeps them resident. The prompt carries a nonce so the specialists'
// response-cache doesn't answer from cache (a HIT would skip the forward
// pass and leave the weights paged out).
const PORTS = [8901, 8902, 8903, 8913]; // resident tier only (8912 Kev excluded: launchd-managed separately)

async function ping(port: number): Promise<number> {
	const t0 = Date.now();
	try {
		const r = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				messages: [{ role: "user", content: `warm ${Date.now()}` }],
				max_tokens: 1,
				temperature: 0,
			}),
			signal: AbortSignal.timeout(30_000),
		});
		if (!r.ok) throw new Error(String(r.status));
		await r.text(); // consume the body so the connection closes cleanly
		return Date.now() - t0;
	} catch {
		return -1;
	}
}

const results = await Promise.all(PORTS.map(ping));
const parts = PORTS.map((p, i) => `:${p}=${results[i] < 0 ? "down" : `${results[i]}ms`}`);
console.log(`keepwarm ${new Date().toISOString()} ${parts.join(" ")}`);
