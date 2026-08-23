import { Fragment, useCallback, useEffect, useState } from "react";
import { ArrowUpRight, ChevronRight } from "lucide-react";
import { api, type Issue } from "@/lib/api";
import { parseFindings, type ParsedFinding } from "@/lib/findings";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious
} from "@/components/ui/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";

const SPECKLE_BASE = "https://app.speckle.systems";
const PAGE_SIZE = 10;

/*
 * A ramp rather than a palette: settled work greys out, open work takes a
 * tint, and anything waiting on a person takes the full blue.
 */
function statusVariant(status: string) {
  if (status === "resolved") return "success" as const;
  if (status === "readyForReview") return "default" as const;
  return "warning" as const;
}

function relativeTime(iso: string): string {
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/** Page numbers to show, with `"ellipsis"` standing in for a skipped run. */
function paginationRange(
  current: number,
  total: number
): (number | "ellipsis")[] {
  const range: (number | "ellipsis")[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);

  if (start > 2) range.push("ellipsis");
  for (let page = start; page <= end; page++) range.push(page);
  if (end < total - 1) range.push("ellipsis");
  if (total > 1) range.push(total);

  return range;
}

const SEVERITY_DOT: Record<ParsedFinding["severity"], string> = {
  high: "bg-destructive",
  medium: "bg-primary",
  low: "bg-muted-foreground/40"
};

/**
 * The findings of one issue, shown inline.
 *
 * Deliberately dense: the counts are the argument — "1 object says this, 500
 * say that" — so they lead each evidence chip and the prose stays to one line.
 */
function FindingList({ findings }: { findings: ParsedFinding[] }) {
  if (findings.length === 0) {
    return (
      <p className="px-4 py-4 text-sm text-muted-foreground">
        No findings recorded in this issue.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-border">
      {findings.map((finding) => (
        <li key={finding.index} className="flex gap-3 px-4 py-2.5">
          <span
            className={cn(
              "mt-1.5 size-2 shrink-0 rounded-full",
              SEVERITY_DOT[finding.severity]
            )}
            title={finding.severity}
          />
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-sm leading-snug">{finding.summary}</p>

            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
              {finding.parameter ? (
                <span
                  className="font-mono text-muted-foreground"
                  title={finding.keyPath ?? undefined}
                >
                  {finding.parameter}
                </span>
              ) : null}

              {finding.evidence.map((item) => (
                <span
                  key={`${item.value}-${item.count}`}
                  className="rounded bg-muted px-1.5 py-0.5 font-mono"
                >
                  <span className="text-muted-foreground">{item.count}x</span>{" "}
                  {item.value || "(empty)"}
                </span>
              ))}

              {finding.suggestion ? (
                <span className="text-primary">{finding.suggestion}</span>
              ) : null}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function Inbox({ refreshKey }: { refreshKey: number }) {
  const [issues, setIssues] = useState<Issue[] | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  // Adjusted during render, not an effect: resetting page state when a prop
  // changes is exactly the case React's docs call out for this pattern.
  const [pageResetKey, setPageResetKey] = useState(refreshKey);
  if (refreshKey !== pageResetKey) {
    setPageResetKey(refreshKey);
    setPage(1);
  }

  const load = useCallback(async () => {
    try {
      const data = await api.listIssues();
      setIssues(data.issues);
      setProjectId(data.projectId);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, []);

  // refreshKey changes when a run completes, so the table follows the pipeline.
  // The effect only kicks off the fetch; state lands in the async callback,
  // not synchronously during the effect.
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load, refreshKey]);

  const totalPages = issues
    ? Math.max(1, Math.ceil(issues.length / PAGE_SIZE))
    : 1;
  const currentPage = Math.min(page, totalPages);
  const pageIssues =
    issues?.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE) ?? [];

  return (
    <div className="space-y-4">
      <header>
        <h1 className="font-serif text-3xl leading-none">Inbox</h1>
        <p className="text-sm text-muted-foreground">
          Issues Scout has filed on this project.
        </p>
      </header>

      <Card>
        {error ? (
          <EmptyState
            title="Could not load issues"
            detail={error}
            action={
              <Button size="sm" variant="outline" onClick={load}>
                Try again
              </Button>
            }
          />
        ) : issues === null ? (
          <div className="space-y-3 p-5">
            {[0, 1, 2, 3].map((row) => (
              <Skeleton key={row} className="h-10 w-full" />
            ))}
          </div>
        ) : issues.length === 0 ? (
          <EmptyState
            title="No issues yet"
            detail="Publish a model version and Scout will inspect it."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead className="w-24">Issue</TableHead>
                <TableHead>Title</TableHead>
                <TableHead className="w-28">Findings</TableHead>
                <TableHead className="w-32">Status</TableHead>
                <TableHead className="w-28">Created</TableHead>
                <TableHead className="w-16" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageIssues.map((issue) => {
                const findings = parseFindings(issue.rawDescription);
                const isOpen = expanded === issue.id;
                return (
                  <Fragment key={issue.id}>
                    <TableRow
                      className="cursor-pointer"
                      onClick={() => setExpanded(isOpen ? null : issue.id)}
                    >
                      <TableCell>
                        <button
                          type="button"
                          aria-expanded={isOpen}
                          aria-label={`${isOpen ? "Hide" : "Show"} findings for ${issue.identifier}`}
                          className="flex items-center text-muted-foreground"
                        >
                          <ChevronRight
                            className={cn(
                              "size-4 transition-transform duration-[240ms] ease-[cubic-bezier(0.4,0,0.2,1)]",
                              isOpen && "rotate-90"
                            )}
                          />
                        </button>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {issue.identifier}
                      </TableCell>
                      <TableCell className="font-medium">
                        {issue.title ?? "Untitled"}
                      </TableCell>
                      <TableCell>
                        {findings.length === 0 ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <Badge variant="secondary">{findings.length}</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(issue.status)}>
                          {issue.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {relativeTime(issue.createdAt)}
                      </TableCell>
                      <TableCell>
                        {projectId ? (
                          <a
                            // Speckle has no per-issue URL — only the project's
                            // issue list, where this identifier can be found.
                            href={`${SPECKLE_BASE}/projects/${projectId}/issues`}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(event) => event.stopPropagation()}
                            className="inline-flex items-center text-muted-foreground hover:text-foreground"
                            aria-label={`Open ${issue.identifier} in Speckle's issue list`}
                          >
                            <ArrowUpRight className="size-4" />
                          </a>
                        ) : null}
                      </TableCell>
                    </TableRow>

                    {/*
                     * Always mounted — a `tr`/`td` can't itself animate to
                     * `height: auto`, so the grid child inside does the work:
                     * its track collapses to 0fr/1fr and the cell follows.
                     */}
                    <TableRow
                      className={cn(
                        "hover:bg-transparent",
                        // Collapsed rows are always mounted for the height
                        // animation below, but shouldn't add a stray hairline
                        // under every closed issue.
                        !isOpen && "border-b-0"
                      )}
                    >
                      <TableCell colSpan={7} className="bg-muted/30 p-0">
                        <div
                          className="grid transition-[grid-template-rows] duration-[240ms] ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none"
                          style={{ gridTemplateRows: isOpen ? "1fr" : "0fr" }}
                        >
                          <div
                            className={cn(
                              "overflow-hidden transition-opacity duration-150 motion-reduce:transition-none",
                              isOpen ? "opacity-100 delay-100" : "opacity-0"
                            )}
                          >
                            <FindingList findings={findings} />
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        )}

        {issues && totalPages > 1 ? (
          <div className="flex items-center justify-between border-t border-border px-4 py-3">
            <p className="text-xs text-muted-foreground">
              Page {currentPage} of {totalPages}
            </p>
            <Pagination className="mx-0 w-auto">
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    disabled={currentPage === 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  />
                </PaginationItem>

                {paginationRange(currentPage, totalPages).map((entry, index) =>
                  entry === "ellipsis" ? (
                    <PaginationItem key={`ellipsis-${index}`}>
                      <PaginationEllipsis />
                    </PaginationItem>
                  ) : (
                    <PaginationItem key={entry}>
                      <PaginationLink
                        isActive={entry === currentPage}
                        onClick={() => setPage(entry)}
                      >
                        {entry}
                      </PaginationLink>
                    </PaginationItem>
                  )
                )}

                <PaginationItem>
                  <PaginationNext
                    disabled={currentPage === totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
