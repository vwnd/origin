import type { ReactNode } from "react";

/**
 * Centred message for an empty or errored panel. Not a shadcn component —
 * shadcn has no equivalent, and every page needs the same shape.
 */
export function EmptyState({
  title,
  detail,
  action
}: {
  title: string;
  detail?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <p className="text-sm font-medium">{title}</p>
      {detail ? (
        <p className="text-muted-foreground max-w-md text-sm">{detail}</p>
      ) : null}
      {action}
    </div>
  );
}
