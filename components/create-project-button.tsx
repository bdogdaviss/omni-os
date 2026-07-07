"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FolderKanban, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";

type CreateProjectButtonProps = {
  proposalId: string;
  approved: boolean;
  existingProjectId?: string | null;
};

type CreateProjectResponse = {
  success: boolean;
  error?: string;
  details?: string;
  project?: { id?: string };
};

function getFailureMessage(result: CreateProjectResponse) {
  if (result.details) {
    return `${result.error ?? "Failed to create project"}: ${result.details}`;
  }

  return result.error ?? "Failed to create project";
}

export function CreateProjectButton({
  proposalId,
  approved,
  existingProjectId,
}: CreateProjectButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (existingProjectId) {
    return (
      <Button asChild type="button" variant="outline">
        <Link href={`/projects/${existingProjectId}`}>
          <FolderKanban aria-hidden="true" />
          View Project
        </Link>
      </Button>
    );
  }

  if (!approved) {
    return (
      <Button disabled type="button" variant="outline">
        <FolderKanban aria-hidden="true" />
        Approve proposal first
      </Button>
    );
  }

  async function createProject() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/projects/create-from-proposal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ proposalId }),
      });
      const result = (await response.json()) as CreateProjectResponse;

      if (!response.ok || !result.success || !result.project?.id) {
        throw new Error(getFailureMessage(result));
      }

      router.push(`/projects/${result.project.id}`);
      router.refresh();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Failed to create project",
      );
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      <Button
        disabled={loading}
        onClick={createProject}
        type="button"
        variant="outline"
      >
        {loading ? (
          <Loader2 className="animate-spin" aria-hidden="true" />
        ) : (
          <FolderKanban aria-hidden="true" />
        )}
        {loading ? "Creating Project..." : "Create Project"}
      </Button>
      <p className="text-xs text-muted-foreground">
        Internal workspace only. Nothing is sent externally.
      </p>
      {error ? (
        <p className="max-w-xs text-xs text-destructive">{error}</p>
      ) : null}
    </div>
  );
}
