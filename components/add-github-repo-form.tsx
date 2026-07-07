"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";

type AddRepoResponse = {
  success: boolean;
  error?: string;
  details?: string;
};

const inputClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-base shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 sm:text-sm";

function getFailureMessage(result: AddRepoResponse) {
  if (result.details) {
    return `${result.error ?? "Failed to add repository"}: ${result.details}`;
  }

  return result.error ?? "Failed to add repository";
}

export function AddGitHubRepoForm() {
  const router = useRouter();
  const [owner, setOwner] = useState("");
  const [name, setName] = useState("");
  const [isPrivate, setIsPrivate] = useState(true);
  const [selected, setSelected] = useState(true);
  const [defaultForProjects, setDefaultForProjects] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function addRepo() {
    if (!owner.trim() || !name.trim()) {
      setError("Owner and repository name are required");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/github/repositories/add", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          owner: owner.trim(),
          name: name.trim(),
          private: isPrivate,
          selected,
          defaultForProjects,
        }),
      });
      const result = (await response.json()) as AddRepoResponse;

      if (!response.ok || !result.success) {
        throw new Error(getFailureMessage(result));
      }

      setOwner("");
      setName("");
      setDefaultForProjects(false);
      router.refresh();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Failed to add repository",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label
            className="text-xs font-medium text-muted-foreground"
            htmlFor="github-repo-owner"
          >
            Owner
          </label>
          <input
            id="github-repo-owner"
            className={inputClass}
            disabled={loading}
            onChange={(event) => setOwner(event.target.value)}
            placeholder="omnistrive"
            value={owner}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label
            className="text-xs font-medium text-muted-foreground"
            htmlFor="github-repo-name"
          >
            Repository name
          </label>
          <input
            id="github-repo-name"
            className={inputClass}
            disabled={loading}
            onChange={(event) => setName(event.target.value)}
            placeholder="repo-name"
            value={name}
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input
            checked={isPrivate}
            disabled={loading}
            onChange={(event) => setIsPrivate(event.target.checked)}
            type="checkbox"
          />
          Private
        </label>
        <label className="flex items-center gap-2">
          <input
            checked={selected}
            disabled={loading}
            onChange={(event) => setSelected(event.target.checked)}
            type="checkbox"
          />
          Selected for publishing
        </label>
        <label className="flex items-center gap-2">
          <input
            checked={defaultForProjects}
            disabled={loading}
            onChange={(event) => setDefaultForProjects(event.target.checked)}
            type="checkbox"
          />
          Default for projects
        </label>
      </div>
      <div>
        <Button disabled={loading} onClick={addRepo} type="button">
          {loading ? (
            <Loader2 className="animate-spin" aria-hidden="true" />
          ) : (
            <Plus aria-hidden="true" />
          )}
          {loading ? "Adding..." : "Add Repository"}
        </Button>
      </div>
      {error ? (
        <p className="break-words text-xs text-destructive">{error}</p>
      ) : null}
    </div>
  );
}
