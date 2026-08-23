# Agent Starter

![npm i agents command](./npm-agents-banner.svg)

<a href="https://deploy.workers.cloudflare.com/?url=https://github.com/cloudflare/agents-starter"><img src="https://deploy.workers.cloudflare.com/button" alt="Deploy to Cloudflare"/></a>

A starter template for building AI chat agents on Cloudflare, powered by the [Agents SDK](https://developers.cloudflare.com/agents/).

Uses Workers AI (no API key required), with tools for weather, timezone detection, calculations with approval, task scheduling, and vision (image input).

## Quick start

```bash
npx create-cloudflare@latest --template cloudflare/agents-starter
cd agents-starter
npm install
npm run dev
```

> **Cloudflare authentication is required to run locally.** This template uses
> Workers AI with `"ai": { "remote": true }` in `wrangler.jsonc`, and Workers AI
> has no local simulator — so `npm run dev` opens a remote proxy session against
> Cloudflare and needs you to be authenticated. Either run `wrangler login` once
> in an interactive terminal, or set a `CLOUDFLARE_API_TOKEN` environment
> variable (e.g. in a `.env` file). No third-party (OpenAI/Anthropic) key is
> needed, but a Cloudflare login is.

Open [http://localhost:5173](http://localhost:5173) to see your agent in action.

Try these prompts to see the different features:

- **"What's the weather in Paris?"** — server-side tool (runs automatically)
- **"What timezone am I in?"** — client-side tool (browser provides the answer)
- **"Calculate 5000 \* 3"** — approval tool (asks you before running)
- **"Remind me in 5 minutes to take a break"** — scheduling
- **Drop an image and ask "What's in this image?"** — vision (image understanding)

## Project structure

```
src/
  server.ts    # Worker entry: Speckle webhook route + chat agent
  app.tsx      # Chat UI built with Kumo components
  client.tsx   # React entry point
  styles.css   # Tailwind + Kumo styles
  speckle/
    config.ts     # Server URL, webhook path, event name (non-secret constants)
    types.ts      # Webhook payload shape + parsing
    signature.ts  # HMAC-SHA256 delivery verification
    client.ts     # GraphQL client (createIssue)
    logging.ts    # Structured JSON logger
    analytics.ts  # Workers Analytics Engine data points
    webhook.ts    # Delivery handler
```

## What's included

- **AI Chat** — Streaming responses powered by Workers AI via `AIChatAgent`
- **Image input** — Drag-and-drop, paste, or click to attach images for vision-capable models
- **Three tool patterns** — server-side auto-execute, client-side (browser), and human-in-the-loop approval
- **Scheduling** — one-time, delayed, and recurring (cron) tasks
- **Reasoning display** — shows model thinking as it streams, collapses when done
- **Debug mode** — toggle in the header to inspect raw message JSON for each message
- **Kumo UI** — Cloudflare's design system with dark/light mode
- **Real-time** — WebSocket connection with automatic reconnection and message persistence

## Speckle integration

Scout reacts to Speckle webhooks. Today it does one thing, to prove the pipeline
end to end: when a new version is published to a model, it creates a
"hello world" issue on that project, pinned to the new version.

### How a delivery flows

1. Speckle POSTs to `/webhooks/speckle` with `{ "payload": { ... } }` and an
   `X-WEBHOOK-SIGNATURE` header — hex HMAC-SHA256 of the raw body.
2. `handleSpeckleWebhook` verifies the signature against `SPECKLE_WEBHOOK_SECRET`
   (401 if it does not match).
3. `issue_created` deliveries — any issue on the project, not only Scout's own —
   are relayed to connected browsers over the events socket and return 200, so
   the Inbox updates live instead of waiting on a reload.
4. Other events are acknowledged with 200 and ignored — Speckle only retries
   on non-2xx.
5. For a `commit_create` match, it calls `projectMutations.issues.createIssue`
   and returns 201.

Speckle's UI shows the trigger as `version_create`, but the value on the wire is
the legacy name `commit_create` — that is what the code matches on.

There is no project-id filter. A Speckle webhook is created inside one project
and only fires for that project, so the project to act on is whatever
`payload.streamId` names on each delivery.

### Configuration

Non-secret settings live in `src/speckle/config.ts`:

| Constant                | Meaning                                     |
| ----------------------- | ------------------------------------------- |
| `SPECKLE_SERVER_URL`    | Speckle server. Change for self-hosted.     |
| `SPECKLE_WEBHOOK_PATH`  | Path the webhook posts to.                  |
| `VERSION_CREATED_EVENT` | Wire name of the trigger (`commit_create`). |
| `ISSUE_CREATED_EVENT`   | Wire name of the trigger (`issue_created`). |

Secrets are Worker secrets, not config (see `.dev.vars.example`):

```bash
wrangler secret put SPECKLE_TOKEN          # PAT with the streams:write scope
wrangler secret put SPECKLE_WEBHOOK_SECRET # secret set on the project webhook
```

For local development, copy `.dev.vars.example` to `.dev.vars` and fill it in.

### Setting up the webhook in Speckle

In the Speckle project: **Settings → Webhooks → Create webhook**

- **URL** — `https://<your-worker>.workers.dev/webhooks/speckle`
- **Events** — `version_create`, `issue_created`
- **Secret** — the same value you stored as `SPECKLE_WEBHOOK_SECRET`

You cannot read the secret back after saving it, so store it when you create it.

### Logs and analytics

Every delivery is measured exactly once, whatever the result. Each carries a
`deliveryId` — also returned in the HTTP response body — so a response, its log
lines, and its analytics row all join up.

**Outcomes**, the one value to group by:

| Outcome           | Status | Meaning                           |
| ----------------- | ------ | --------------------------------- |
| `issue_created`   | 201    | Matched, issue created            |
| `issue_synced`    | 200    | Speckle issue event relayed to UI |
| `ignored_event`   | 200    | Event we do not act on            |
| `ignored_payload` | 200    | Right event, missing fields       |
| `bad_signature`   | 401    | HMAC did not verify               |
| `bad_request`     | 400    | Unparseable body or payload       |
| `not_configured`  | 500    | Missing token or webhook secret   |
| `speckle_error`   | 502    | Speckle rejected issue creation   |

**Logs** — structured JSON, one object per line, via Workers Logs
(`observability` is enabled at a 1.0 sampling rate):

```bash
wrangler tail --format pretty        # live
wrangler tail --search issue_created # one event type
```

Fields are queryable in the dashboard as `$.event`, `$.outcome`,
`$.deliveryId`, `$.versionId`.

**Analytics** — one data point per delivery in the `scout_speckle_deliveries`
dataset. Slots are positional:

| Slot     | Value              | Slot      | Value                |
| -------- | ------------------ | --------- | -------------------- |
| `index1` | outcome            | `blob7`   | issue identifier     |
| `blob1`  | outcome            | `blob8`   | error (truncated)    |
| `blob2`  | event name         | `blob9`   | delivery id          |
| `blob3`  | project id         | `blob10`  | worker version tag   |
| `blob4`  | model id           | `double1` | HTTP status          |
| `blob5`  | version id         | `double2` | duration (ms)        |
| `blob6`  | source application | `double3` | 1 on success, else 0 |

Query with the SQL API (needs an API token with Account Analytics Read):

```bash
curl "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/analytics_engine/sql"   -H "Authorization: Bearer $CF_API_TOKEN"   --data "SELECT blob1 AS outcome, count() AS n, avg(double2) AS avg_ms
          FROM scout_speckle_deliveries
          WHERE timestamp > NOW() - INTERVAL '1' DAY
          GROUP BY outcome ORDER BY n DESC"
```

Recent deliveries, newest first:

```sql
SELECT timestamp, blob1 AS outcome, blob5 AS version_id,
       blob7 AS issue, blob8 AS error, double2 AS ms
FROM scout_speckle_deliveries
WHERE timestamp > NOW() - INTERVAL '1' DAY
ORDER BY timestamp DESC LIMIT 20
```

The Analytics Engine binding does not work in local dev — `recordDelivery`
no-ops there, and the logs still print.

## Making it your own

### Name your project

Update the name in `package.json` and `wrangler.jsonc` — the `name` in `wrangler.jsonc` becomes your deployed Worker's URL (`<name>.<subdomain>.workers.dev`).

### Change the system prompt

Edit the `system` string in `server.ts` to give your agent a different personality or focus area. This is the most impactful single change you can make.

### Replace the demo tools with real ones

The starter ships with demo tools (`getWeather` returns random data, `calculate` does basic arithmetic). Replace them with real implementations:

```ts
// In server.ts, replace a demo tool with a real API call:
getWeather: tool({
  description: "Get the current weather for a city",
  inputSchema: z.object({ city: z.string() }),
  execute: async ({ city }) => {
    const res = await fetch(`https://api.weather.example/${city}`);
    return res.json();
  }
}),
```

### Add your own tools

Add new tools to the `tools` object in `server.ts`. There are three patterns:

```ts
// Auto-execute: runs on the server, no user interaction
myTool: tool({
  description: "...",
  inputSchema: z.object({ /* ... */ }),
  execute: async (input) => { /* return result */ }
}),

// Client-side: no execute function, browser provides the result
// Handle it in app.tsx via the onToolCall callback
browserTool: tool({
  description: "...",
  inputSchema: z.object({ /* ... */ })
}),

// Approval: add needsApproval to gate execution
sensitiveTool: tool({
  description: "...",
  inputSchema: z.object({ /* ... */ }),
  needsApproval: async (input) => true, // or conditional logic
  execute: async (input) => { /* runs after approval */ }
}),
```

### Customize scheduled task behavior

When a scheduled task fires, `executeTask` runs on the server. It does its work and then uses `this.broadcast()` to notify connected clients (shown as a toast notification in the UI). Replace it with your own logic:

```ts
async executeTask(description: string, task: Schedule<string>) {
  // Do the actual work
  await sendEmail({ to: "user@example.com", subject: description });

  // Notify connected clients
  this.broadcast(
    JSON.stringify({ type: "scheduled-task", description, timestamp: new Date().toISOString() })
  );
}
```

> **Why `broadcast()` instead of `saveMessages()`?** Injecting into chat history can cause the AI to see the notification as new context and re-trigger the same task in a loop. `broadcast()` sends a one-off event that the client displays separately from the conversation.

### Remove scheduling

If you don't need scheduling, remove `scheduleTask`, `getScheduledTasks`, and `cancelScheduledTask` from the tools object, the `executeTask` method, and the schedule-related imports (`getSchedulePrompt`, `scheduleSchema`, `Schedule`).

### Add state beyond chat messages

Use `this.setState()` and `this.state` for real-time state that syncs to all connected clients. See [Store and sync state](https://developers.cloudflare.com/agents/api-reference/store-and-sync-state/).

### Add callable methods

Expose agent methods as typed RPC that your client can call directly:

```ts
import { callable } from "agents";

export class ChatAgent extends AIChatAgent<Env> {
  @callable()
  async getStats() {
    return { messageCount: this.messages.length };
  }
}

// Client-side:
const stats = await agent.call("getStats");
```

See [Callable methods](https://developers.cloudflare.com/agents/api-reference/callable-methods/).

### Connect to MCP servers

Add external tools from MCP servers:

```ts
async onChatMessage(onFinish, options) {
  // Connect to an MCP server
  await this.mcp.connect("https://my-mcp-server.example/sse");

  const result = streamText({
    // ...
    tools: {
      ...myTools,
      ...this.mcp.getAITools() // Include MCP tools
    }
  });
}
```

See [MCP Client API](https://developers.cloudflare.com/agents/api-reference/mcp-client-api/).

## Use a different AI model provider

The starter uses [Workers AI](https://developers.cloudflare.com/workers-ai/) by default (no API key needed). To use a different provider:

### OpenAI

```bash
npm install @ai-sdk/openai
```

```ts
// In server.ts, replace the model:
import { openai } from "@ai-sdk/openai";

// Inside onChatMessage:
const result = streamText({
  model: openai("gpt-5.2")
  // ...
});
```

Create a `.env` file with your API key:

```
OPENAI_API_KEY=your-key-here
```

### Anthropic

```bash
npm install @ai-sdk/anthropic
```

```ts
import { anthropic } from "@ai-sdk/anthropic";

const result = streamText({
  model: anthropic("claude-sonnet-4-20250514")
  // ...
});
```

Create a `.env` file with your API key:

```
ANTHROPIC_API_KEY=your-key-here
```

## Deploy

```bash
npm run deploy
```

Your agent is live on Cloudflare's global network. Messages persist in SQLite, streams resume on disconnect, and the agent hibernates when idle.

## Learn more

- [Agents SDK documentation](https://developers.cloudflare.com/agents/)
- [Build a chat agent tutorial](https://developers.cloudflare.com/agents/getting-started/build-a-chat-agent/)
- [Chat agents API reference](https://developers.cloudflare.com/agents/api-reference/chat-agents/)
- [Workers AI models](https://developers.cloudflare.com/workers-ai/models/)

## License

MIT
