// fleet.ts — `fleet` from any directory: start the board server if it is not
// already up, then open it in the browser. Alias in .zshrc:
//   alias fleet="bun $HOME/.claude/bin/fleet.ts"
const PORT = String(Number(process.argv[process.argv.indexOf("--port") + 1] ?? 7799) || 7799);
const URL = "http://127.0.0.1:" + PORT;

const up = await fetch(URL + "/api/data", { signal: AbortSignal.timeout(400) })
	.then((r) => r.ok)
	.catch(() => false);

if (!up) {
	Bun.spawn(["bun", process.env.HOME + "/.claude/bin/fleet-board.ts", "--port", PORT], { stdout: "ignore", stderr: "ignore" });
	let ok = false;
	for (let i = 0; i < 20; i++) {
		await Bun.sleep(150);
		ok = await fetch(URL + "/api/data", { signal: AbortSignal.timeout(300) })
			.then((r) => r.ok)
			.catch(() => false);
		if (ok) break;
	}
	if (!ok) {
		console.error("fleet: server did not come up on " + PORT + " — check ~/.claude/bin/fleet-board.ts");
		process.exit(1);
	}
}

await Bun.$`open ${URL}`.quiet();
console.log("fleet board → " + URL + (up ? "  (already running)" : "  (server started)"));
