import type { Decision, Source } from "../shared/types";
import { CORE, DISCOVERY } from "../shared/chain";
import { Icon } from "./icons";

export function Receipt({
  source,
  decision,
}: {
  source: Source | null;
  decision?: Decision | null;
}) {
  if (!source)
    return (
      <p>
        No source has been checked yet. Use “Check source” to verify activity.
      </p>
    );
  return (
    <div className="receipt">
      <p>
        {source.available
          ? "This active round was matched to a successful transaction receipt and canonical block on Ethereum Sepolia."
          : `${source.detail} This turn uses normal mode.`}
      </p>
      <dl>
        <div>
          <dt>Network</dt>
          <dd>Ethereum Sepolia · 11155111</dd>
        </div>
        <div>
          <dt>Core contract</dt>
          <dd>
            <code>{CORE}</code>
          </dd>
        </div>
        {source.available && (
          <>
            <div>
              <dt>Source status</dt>
              <dd>
                {source.freshness === "fresh"
                  ? "Fresh · newly observed round"
                  : "Reused · previously observed round"}
              </dd>
            </div>
            <div>
              <dt>Verification</dt>
              <dd>
                {source.verification === "rpc"
                  ? "RPC checked"
                  : "Cached check (under 60 seconds)"}
              </dd>
            </div>
            <div>
              <dt>Active round</dt>
              <dd>{source.round.roundId}</dd>
            </div>
            <div>
              <dt>Work / cumulative work</dt>
              <dd>
                {source.round.work} / {source.round.cumulativeWork}
              </dd>
            </div>
            <div>
              <dt>Cumulative block units</dt>
              <dd>{source.round.cumulativeBlockUnits}</dd>
            </div>
            <div>
              <dt>Work per 1,000 blocks</dt>
              <dd>{source.round.workPerThousandBlocks}</dd>
            </div>
            <div>
              <dt>Ethereum block</dt>
              <dd>
                {source.round.blockNumber} · {source.round.confirmations}{" "}
                confirmations at check
              </dd>
            </div>
            <div>
              <dt>Checked through block</dt>
              <dd>{source.round.checkedThroughBlock}</dd>
            </div>
            <div>
              <dt>Recorded / verified</dt>
              <dd>
                {new Date(source.round.blockTimestamp).toISOString()}
                <br />
                {new Date(source.round.verifiedAt).toISOString()}
              </dd>
            </div>
            <div>
              <dt>Transaction</dt>
              <dd>
                <a
                  target="_blank"
                  rel="noreferrer"
                  href={`https://sepolia.etherscan.io/tx/${source.round.transactionHash}`}
                >
                  <code>{source.round.transactionHash}</code>
                  <Icon name="external" size={14} />
                </a>
              </dd>
            </div>
            <div>
              <dt>Block hash</dt>
              <dd>
                <code>{source.round.blockHash}</code>
              </dd>
            </div>
            <div>
              <dt>Data hash</dt>
              <dd>
                <code>{source.round.dataHash}</code>
              </dd>
            </div>
            <div>
              <dt>Log index</dt>
              <dd>{source.round.logIndex}</dd>
            </div>
            <div>
              <dt>RPC</dt>
              <dd>
                <code>{source.round.rpc}</code>
              </dd>
            </div>
          </>
        )}
        {decision && (
          <>
            <div>
              <dt>Selected route</dt>
              <dd>
                {decision.mode}
                {decision.move ? ` · ${decision.move}` : ""} · {decision.reason}
              </dd>
            </div>
            <div>
              <dt>Session / turn</dt>
              <dd>
                <code>{decision.before.session}</code> /{" "}
                {decision.after.counter}
              </dd>
            </div>
            <div>
              <dt>Frequency / cooldown</dt>
              <dd>
                {decision.config.frequency}% / {decision.config.cooldown} turns
              </dd>
            </div>
            <div>
              <dt>Previous creative turn</dt>
              <dd>{decision.before.lastCreative ?? "None"}</dd>
            </div>
            <div>
              <dt>Decision digest</dt>
              <dd>
                <code>{decision.digest ?? "No draw: source unavailable"}</code>
              </dd>
            </div>
            <div>
              <dt>Draw</dt>
              <dd>
                {decision.draw ?? "None"} · algorithm {decision.version}
              </dd>
            </div>
          </>
        )}
      </dl>
      <p className="fine-print">
        Verification trusts the selected RPC. The data hash commits to records;
        it does not prove physical activity. Public deterministic variety is not
        security-grade randomness.
      </p>
      <a
        className="text-button"
        href={DISCOVERY}
        target="_blank"
        rel="noreferrer"
      >
        Open discovery record <Icon name="external" size={16} />
      </a>
    </div>
  );
}
