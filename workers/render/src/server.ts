import { createServer } from "node:http";
import { z } from "zod";
import { executeRender } from "./render";
import { prisma } from "../../../src/lib/prisma";
import { Sentry } from "../../../src/lib/observability/node";

const RequestSchema = z.object({ renderId: z.string().uuid() });
const port = Number(process.env.PORT ?? 8080);
let queue = Promise.resolve<unknown>(undefined);
const activeJobs = new Map<string, Promise<unknown>>();

createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/health") {
    response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ ok: true }));
    return;
  }
  if (request.method === "GET" && request.url === "/ready") {
    try { await prisma.$queryRaw`SELECT 1`; response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ ready: true })); }
    catch { response.writeHead(503, { "content-type": "application/json" }).end(JSON.stringify({ ready: false })); }
    return;
  }
  if (request.method !== "POST" || request.url !== "/render") {
    response.writeHead(404).end();
    return;
  }
  const expected = process.env.RENDER_WORKER_SECRET;
  if (!expected || request.headers.authorization !== `Bearer ${expected}`) {
    response.writeHead(401, { "content-type": "application/json" }).end(JSON.stringify({ error: "Unauthorized" }));
    return;
  }
  try {
    const chunks: Buffer[] = [];
    let bytes = 0;
    for await (const chunk of request) {
      const buffer = Buffer.from(chunk);
      bytes += buffer.length;
      if (bytes > 16_384) throw new Error("Request body is too large.");
      chunks.push(buffer);
    }
    const input = RequestSchema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    const render = await prisma.videoRender.findUniqueOrThrow({ where: { id: input.renderId } });
    if (render.status === "SUCCEEDED") {
      response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ renderId: render.id, assetId: render.assetId, status: render.status }));
      return;
    }
    if (!activeJobs.has(input.renderId)) {
      const job = queue.then(() => executeRender(input.renderId));
      activeJobs.set(input.renderId, job);
      queue = job.catch(() => undefined);
      void job.finally(() => activeJobs.delete(input.renderId)).catch(() => undefined);
    }
    response.writeHead(202, { "content-type": "application/json" }).end(JSON.stringify({ renderId: input.renderId, status: "ACCEPTED" }));
  } catch (error) {
    Sentry.captureException(error, { tags: { component: "render-worker" } });
    await Sentry.flush(2_000);
    const status = error instanceof z.ZodError || (error instanceof Error && error.message === "Request body is too large.") ? 400 : 500;
    response.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify({ error: error instanceof Error ? error.message : "Render failed" }));
  }
}).listen(port, "0.0.0.0", () => {
  process.stdout.write(JSON.stringify({ level: "info", message: "render worker listening", port }) + "\n");
});
