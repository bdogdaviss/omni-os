import {
  estimateAgentBuild,
  formatUsd,
  formatUsdRange,
  sumUsdCents,
} from "@/lib/ai/cost";
import type { Usage } from "@/lib/ai/generate";

/**
 * What a proposal has cost, and what building it would cost.
 *
 * The two lines are deliberately worded differently. Drafting is a measurement
 * — those tokens were billed. The build is a guess about runs that have not
 * happened. Rendering them in the same voice would be the lie.
 */
export function ProposalCost({
  usage,
  taskCount,
}: {
  usage: Usage[];
  taskCount: number;
}) {
  const { cents, unpricedCalls } = sumUsdCents(usage);
  const build = estimateAgentBuild(taskCount);
  // "Billed" may only describe calls we actually priced. When every call ran
  // on an unpriced model (e.g. the OpenAI failover), saying "$0.00 billed"
  // would report real spend as free — the exact lie usdCents() returning null
  // instead of 0 exists to prevent.
  const pricedCalls = usage.length - unpricedCalls;

  return (
    <div className="space-y-1 text-xs text-muted-foreground">
      <p>
        {usage.length === 0 ? (
          "AI drafting: nothing generated yet."
        ) : pricedCalls > 0 ? (
          <>
            AI drafting:{" "}
            <span className="font-medium text-foreground">
              {formatUsd(cents)}
            </span>{" "}
            billed across {pricedCalls} {pricedCalls === 1 ? "call" : "calls"}.
          </>
        ) : null}
        {unpricedCalls > 0 ? (
          <>
            {pricedCalls > 0 ? " Plus " : "AI drafting: "}
            {unpricedCalls} {unpricedCalls === 1 ? "call" : "calls"} on a model
            with no price configured — spend unknown, not $0.
          </>
        ) : null}
      </p>

      {build.taskCount > 0 ? (
        <p>
          Coding agents: an estimated{" "}
          <span className="font-medium text-foreground">
            {formatUsdRange(build.lowCents, build.highCents)}
          </span>{" "}
          to build {build.taskCount}{" "}
          {build.taskCount === 1 ? "task" : "tasks"}, up to{" "}
          {formatUsd(build.ceilingCents)} if every task runs to its turn limit.
          This is a projection from a flat per-task figure, not a measurement of
          your runs.
        </p>
      ) : null}
    </div>
  );
}
