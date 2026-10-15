import { defineConfig } from "@trigger.dev/sdk";
import { prismaExtension } from "@trigger.dev/build/extensions/prisma";

export default defineConfig({
  project: process.env.TRIGGER_PROJECT_REF ?? "proj_arshoohyphgefpqxzivf",
  dirs: ["./trigger"],
  machine: "small-1x",
  maxDuration: 1800,
  build: {
    extensions: [prismaExtension({ mode: "legacy", schema: "prisma/schema.prisma" })],
  },
  retries: {
    enabledInDev: false,
    default: {
      maxAttempts: 3,
      factor: 2,
      minTimeoutInMs: 1_000,
      maxTimeoutInMs: 30_000,
      randomize: true,
    },
  },
});
