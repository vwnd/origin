import { routeAgentRequest } from "agents";
import {
  handleSpeckleWebhook,
  isSpeckleWebhookRequest
} from "./speckle/webhook";
import { handleDebug, isDebugRequest } from "./inspection/debug";
import { handleApi, isApiRequest } from "./api/routes";
import { purgeExpiredIndexes, reapStuckRuns } from "./api/reaper";

export { InspectionAgent } from "./inspection/agent";
export { EventsAgent } from "./api/events";
export { InspectionWorkflow } from "./inspection/workflow";

export default {
  async fetch(request: Request, env: Env) {
    // Speckle webhook deliveries land here before the agent router.
    if (isSpeckleWebhookRequest(request)) {
      return await handleSpeckleWebhook(request, env);
    }

    // JSON API behind the UI.
    if (isApiRequest(request)) {
      return await handleApi(request, env);
    }

    // Token-gated inspection diagnostics.
    if (isDebugRequest(request)) {
      return await handleDebug(request, env);
    }

    // Serves the EventsAgent WebSocket the UI subscribes to.
    return (
      (await routeAgentRequest(request, env)) ||
      new Response("Not found", { status: 404 })
    );
  },

  // Reconcile run history against the Workflows engine, so a killed isolate
  // (exceededCpu has no catchable error) cannot leave a run "running" forever.
  // Then destroy the index storage of versions whose runs are long over —
  // expired agents usually remove themselves, this covers the ones that
  // could not (pre-TTL objects, isolates killed before the timer was armed).
  async scheduled(_controller, env) {
    await reapStuckRuns(env);
    await purgeExpiredIndexes(env);
  }
} satisfies ExportedHandler<Env>;
