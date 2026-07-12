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
  const claudeBuild = estimateAgentBuild(taskCount, "claude");
  const openAiBuild = estimateAgentBuild(taskCount, "openai");
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

      {claudeBuild.taskCount > 0 ? (
        <p>
          Coding agents for {claudeBuild.taskCount}{" "}
          {claudeBuild.taskCount === 1 ? "task" : "tasks"}: Claude{" "}
          <span className="font-medium text-foreground">
            {formatUsdRange(claudeBuild.lowCents, claudeBuild.highCents)}
          </span>{" "}
          or ChatGPT{" "}
          <span className="font-medium text-foreground">
            {formatUsdRange(openAiBuild.lowCents, openAiBuild.highCents)}
          </span>. Worst-case turn-limit ceilings are {formatUsd(claudeBuild.ceilingCents)} and {formatUsd(openAiBuild.ceilingCents)}, respectively. These are projections, not measurements.
        </p>
      ) : null}
    </div>
  );
}
