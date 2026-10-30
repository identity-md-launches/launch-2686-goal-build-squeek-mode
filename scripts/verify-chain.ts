import { verifySource } from "../shared/chain";
import { decide } from "../shared/engine";

const source = await verifySource({ timeoutMs: 20_000 });
const decision = await decide(
  source,
  { session: "verification-run", counter: 0, lastCreative: null },
  { frequency: 20, cooldown: 2 },
);
process.stdout.write(
  `${JSON.stringify({ checkedAt: new Date().toISOString(), source, decision }, null, 2)}\n`,
);
if (!source.available) process.exitCode = 1;
