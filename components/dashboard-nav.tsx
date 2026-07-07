"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/intake", label: "Intake" },
  { href: "/clients", label: "Clients" },
  { href: "/projects", label: "Projects" },
  { href: "/briefs", label: "Briefs" },
  { href: "/proposals", label: "Proposals" },
  { href: "/tasks", label: "Tasks" },
  { href: "/issue-drafts", label: "Issue Drafts" },
  { href: "/launch", label: "Launch" },
  { href: "/settings/github", label: "GitHub" },
] as const;

export function DashboardNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="rounded-lg border bg-background shadow-sm"
    >
      <div className="no-scrollbar flex items-center gap-1 overflow-x-auto p-1">
        {NAV_ITEMS.map((item) => {
          const active =
            pathname === item.href || pathname?.startsWith(`${item.href}/`);

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "shrink-0 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
