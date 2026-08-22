import { useCallback, useState } from "react";
import {
  NavLink,
  Navigate,
  Route,
  BrowserRouter as Router,
  Routes
} from "react-router-dom";
import { Toaster, toast } from "sonner";
import { BarChart3, Inbox as InboxIcon, Radar, Radio } from "lucide-react";
import { useScoutEvents, type ScoutEvent } from "@/lib/events";
import { cn } from "@/lib/utils";
import { Inbox } from "@/pages/Inbox";
import { Scouts } from "@/pages/Scouts";
import { Analytics } from "@/pages/Analytics";

const NAV = [
  { to: "/inbox", label: "Inbox", icon: InboxIcon },
  { to: "/scouts", label: "Scouts", icon: Radar },
  { to: "/analytics", label: "Analytics", icon: BarChart3 }
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
    }
  }, []);

  const { connected } = useScoutEvents({ onEvent });

  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-3">
          <span className="flex items-center gap-2 font-semibold tracking-tight">
            <Radar className="size-5" />
            Origo
          </span>

          <nav className="flex items-center gap-1">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors",
                    isActive
                      ? "bg-accent font-medium text-accent-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )
                }
              >
                <item.icon className="size-4" />
                {item.label}
              </NavLink>
            ))}
          </nav>

          <span
            className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground"
            title={
              connected
                ? "Receiving live pipeline events"
                : "Reconnecting to the event stream"
            }
          >
            <Radio
              className={cn(
                "size-3.5",
                connected ? "text-emerald-500" : "text-muted-foreground"
              )}
            />
            {connected ? "live" : "offline"}
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-6">
        <Routes>
          <Route path="/" element={<Navigate to="/inbox" replace />} />
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
      <Shell />
    </Router>
  );
}
