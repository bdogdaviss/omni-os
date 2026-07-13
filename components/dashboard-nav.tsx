"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ClipboardList,
  FileCode2,
  FileText,
  FolderKanban,
  Github,
  Inbox,
  ListChecks,
  Menu,
  Megaphone,
  Rocket,
  Users,
} from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  { href: "/marketing", label: "Marketing" },
  { href: "/settings/github", label: "GitHub" },
] as const;

const MOBILE_ITEMS = [
  { href: "/dashboard", label: "Inbox", icon: Inbox },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/clients", label: "Clients", icon: Users },
] as const;

const MORE_ITEMS = [
  { href: "/intake", label: "New Intake", icon: ClipboardList },
  { href: "/briefs", label: "Briefs", icon: FileText },
  { href: "/proposals", label: "Proposals", icon: FileText },
  { href: "/tasks", label: "Tasks", icon: ListChecks },
  { href: "/issue-drafts", label: "Issue Drafts", icon: FileCode2 },
  { href: "/launch", label: "Launch", icon: Rocket },
  { href: "/marketing", label: "Marketing", icon: Megaphone },
  { href: "/settings/github", label: "GitHub", icon: Github },
] as const;

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function DashboardNav() {
  const pathname = usePathname() ?? "";
  const moreActive = MORE_ITEMS.some((item) => isActive(pathname, item.href));

  return (
    <>
      <nav
        aria-label="Primary"
        className="hidden rounded-lg border bg-background shadow-sm sm:block"
      >
        <div className="no-scrollbar flex items-center gap-1 overflow-x-auto p-1">
          {NAV_ITEMS.map((item) => {
            const active = isActive(pathname, item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "shrink-0 whitespace-nowrap rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
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

      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-50 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_rgb(0_0_0/0.08)] backdrop-blur sm:hidden"
        data-mobile-nav
      >
        <div className="grid h-16 grid-cols-4">
          {MOBILE_ITEMS.map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;

            return (
              <Link
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-11 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors",
                  active ? "text-primary" : "text-muted-foreground",
                )}
                href={item.href}
                key={item.href}
              >
                <Icon className="size-5" aria-hidden="true" />
                {item.label}
              </Link>
            );
          })}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                aria-current={moreActive ? "page" : undefined}
                className={cn(
                  "flex min-h-11 flex-col items-center justify-center gap-1 text-[11px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                  moreActive ? "text-primary" : "text-muted-foreground",
                )}
                type="button"
              >
                <Menu className="size-5" aria-hidden="true" />
                More
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="mb-1 w-56 p-2"
              side="top"
            >
              {MORE_ITEMS.map((item) => {
                const Icon = item.icon;

                return (
                  <DropdownMenuItem
                    asChild
                    className="min-h-11 cursor-pointer px-3"
                    key={item.href}
                  >
                    <Link href={item.href}>
                      <Icon aria-hidden="true" />
                      {item.label}
                    </Link>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </nav>
    </>
  );
}
