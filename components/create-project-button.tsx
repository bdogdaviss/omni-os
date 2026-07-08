"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FolderKanban, Loader2 } from "lucide-react";
import { toast } from "sonner";

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
    const toastId = toast.loading("Creating project…");

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

      toast.success("Project created", { id: toastId });
      router.push(`/projects/${result.project.id}`);
      router.refresh();
    } catch (caughtError) {
      toast.error(
        caughtError instanceof Error
          ? caughtError.message
          : "Failed to create project",
        { id: toastId },
      );
      setLoading(false);
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-2">
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
    </div>
  );
}
