// Dependency ordering for the serial build pipeline.
//
// Why serial and ordered: every dispatched task branches from staging and
// merges back before the next one starts, so a task's dependencies must have
// MERGED before it branches — otherwise the agent builds against code that
// isn't there yet. The build-tasks agent already emits a dependency list per
// task (titles of other tasks in the same batch); this turns that into a
// dispatch order.

// Relative import (not the @/ alias) so the .check.ts file runs under plain node.
import { normalizeText } from "../duplicates/normalize.ts";

export type OrderableTask = {
  id: string;
  title: string | null;
  dependencies: unknown; // jsonb from build_tasks — expected string[]
};

function dependencyTitles(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

/**
 * Kahn's algorithm with stable tie-breaking: among ready tasks, original array
 * order wins (the model already emits a sensible sequence). Dependencies that
 * don't match any task title in the batch are ignored — the model sometimes
 * names work that was deduped away.
 *
 * ponytail: cycles are broken by original order (the earliest unprocessed task
 * is forced ready) instead of being rejected. A cycle here means the model
 * contradicted itself; building in list order is the least-wrong recovery.
 * Upgrade path: surface cycles at the approval gate so a human can reorder.
 */
export function orderTasksByDependencies(tasks: OrderableTask[]): string[] {
  const byTitle = new Map<string, number>();

  tasks.forEach((task, index) => {
    const key = normalizeText(task.title ?? "");

    if (key && !byTitle.has(key)) {
      byTitle.set(key, index);
    }
  });

  // Edges: task -> indexes of tasks it depends on (must come first).
  const dependsOn = tasks.map((task, index) =>
    dependencyTitles(task.dependencies)
      .map((title) => byTitle.get(normalizeText(title)))
      .filter((i): i is number => i !== undefined && i !== index),
  );

  const done = new Array<boolean>(tasks.length).fill(false);
  const order: string[] = [];

  while (order.length < tasks.length) {
    let picked = -1;

    for (let i = 0; i < tasks.length; i++) {
      if (!done[i] && dependsOn[i].every((dep) => done[dep])) {
        picked = i;
        break;
      }
    }

    if (picked === -1) {
      // Cycle: force the earliest unprocessed task.
      picked = done.findIndex((flag) => !flag);
    }

    done[picked] = true;
    order.push(tasks[picked].id);
  }

  return order;
}
