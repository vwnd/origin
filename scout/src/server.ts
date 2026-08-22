import { routeAgentRequest } from "agents";
import {
  handleSpeckleWebhook,
  isSpeckleWebhookRequest
} from "./speckle/webhook";
import { handleDebug, isDebugRequest } from "./inspection/debug";
import { handleApi, isApiRequest } from "./api/routes";

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
  }
} satisfies ExportedHandler<Env>;
