import { useCallback, useState } from "react";
import {
  Link,
  NavLink,
  Navigate,
  Route,
  BrowserRouter as Router,
  Routes
} from "react-router-dom";
import { Toaster, toast } from "sonner";
import { useScoutEvents, type ScoutEvent } from "@/lib/events";
import { cn } from "@/lib/utils";
import { Inbox } from "@/pages/Inbox";
import { Scouts } from "@/pages/Scouts";
import { Analytics } from "@/pages/Analytics";
import { Landing } from "@/pages/Landing";

const NAV = [
  { to: "/inbox", label: "Inbox" },
  { to: "/scouts", label: "Scouts" },
  { to: "/analytics", label: "Analytics" }
];

function Shell() {
  // Bumped whenever the pipeline changes something, so the data pages reload
  // without each having to hold its own socket.
  const [refreshKey, setRefreshKey] = useState(0);

  const onEvent = useCallback((event: ScoutEvent) => {
    switch (event.type) {
      case "version_published":
        toast.info("New version published", {
          description: `${event.modelName ?? "Model"} — inspecting it now.`
        });
        setRefreshKey((key) => key + 1);
        break;

      case "run_progress":
        if (event.step === "indexed") {
          const objects = Number(event.detail?.objects ?? 0);
          toast.message("Version indexed", {
            description: `${objects.toLocaleString()} objects — judging parameters.`
          });
        }
        setRefreshKey((key) => key + 1);
        break;

      case "run_complete":
        if (event.outcome === "issue_created") {
          toast.success(`${event.issueIdentifier} filed`, {
            description: `${event.findings} findings, ${event.deltas} proposed edits.`
          });
        } else {
          toast.success("Inspection complete", {
            description: "No new findings on this version."
          });
        }
        setRefreshKey((key) => key + 1);
        break;

      case "run_failed":
        toast.error("Inspection failed", { description: event.error });
        setRefreshKey((key) => key + 1);
        break;

      // Speckle fires this for every issue on the project, including the
      // ones Scout just filed itself — which already get their own toast
      // above from run_complete, so this only needs to refresh the list.
      case "issue_synced":
        setRefreshKey((key) => key + 1);
        break;
    }
  }, []);

  const { connected } = useScoutEvents({ onEvent });

  return (
    <div className="min-h-full">
      {/*
       * The masthead of the same sheet the landing page is printed on: serif
       * wordmark, mono nav, one hairline. Nothing here is a pill or a chip.
       */}
      <header className="sticky top-0 z-10 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-baseline gap-8 px-6 py-3.5">
          <Link to="/" className="font-serif text-2xl leading-none">
            Origo
          </Link>

          <nav className="flex items-baseline gap-6">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    "border-b pb-0.5 font-mono text-[0.6875rem] tracking-[0.12em] uppercase transition-colors",
                    isActive
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <span
            className="ml-auto flex items-center gap-2 font-mono text-[0.6875rem] tracking-[0.12em] text-muted-foreground uppercase"
            title={
              connected
                ? "Receiving live pipeline events"
                : "Reconnecting to the event stream"
            }
          >
            <span className="relative flex size-1.5">
              {connected ? (
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-75" />
              ) : null}
              <span
                className={cn(
                  "relative inline-flex size-1.5 rounded-full",
                  connected ? "bg-primary" : "bg-muted-foreground/40"
                )}
              />
            </span>
            {connected ? "Live" : "Offline"}
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-6">
        <Routes>
          <Route path="/inbox" element={<Inbox refreshKey={refreshKey} />} />
          <Route path="/scouts" element={<Scouts />} />
          <Route
            path="/analytics"
            element={<Analytics refreshKey={refreshKey} />}
          />
          <Route path="*" element={<Navigate to="/inbox" replace />} />
        </Routes>
      </main>

      <Toaster position="bottom-right" richColors closeButton />
    </div>
  );
}

export default function App() {
  return (
    <Router>
      <Routes>
        {/* The landing page is deliberately outside the shell: no header, no
            event socket, nothing but the way in. */}
        <Route path="/" element={<Landing />} />
        <Route path="*" element={<Shell />} />
      </Routes>
    </Router>
  );
}
