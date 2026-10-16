/** Local composition verification only: no AI calls, uploads, or avatar claims. */
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { resolve, join, basename } from "node:path";
import { bundle } from "@remotion/bundler";
import { renderStill, renderMedia, selectComposition } from "@remotion/renderer";
import type { VideoInput } from "../packages/video/src/types";

async function main() {
  const output = resolve(process.argv[2] ?? "/tmp/btv-video-verification");
  await mkdir(output, { recursive: true });
  const compositor = resolve("node_modules/@remotion/compositor-darwin-arm64");
  const ffmpeg = join(compositor, "ffmpeg");
  const env = { ...process.env, DYLD_LIBRARY_PATH: compositor };
  execFileSync(ffmpeg, ["-y", "-f", "lavfi", "-i", "sine=frequency=180:duration=6", "-c:a", "pcm_s16le", join(output, "audio.wav")], { env, stdio: "ignore" });
  execFileSync(ffmpeg, ["-y", "-f", "lavfi", "-i", "nullsrc=s=1920x1080:r=30:d=6", "-c:v", "libx264", "-pix_fmt", "yuv420p", join(output, "presenter-fixture.mp4")], { env, stdio: "ignore" });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><rect width="1920" height="1080" fill="#16231c"/><circle cx="960" cy="410" r="130" fill="#c89b3c"/><path d="M 650 900 Q 650 560 960 560 Q 1270 560 1270 900" fill="#82988a"/><text x="960" y="990" text-anchor="middle" fill="white" font-size="24">LAYOUT FIXTURE · paid avatar generation requires credentials</text></svg>`;
  await writeFile(join(output, "visual.svg"), svg);
  const server = createServer(async (request, response) => {
    try {
      const name = basename(new URL(request.url ?? "/", "http://localhost").pathname);
      response.setHeader("content-type", name.endsWith(".svg") ? "image/svg+xml" : name.endsWith(".wav") ? "audio/wav" : "video/mp4");
      response.end(await readFile(join(output, name)));
    } catch { response.writeHead(404).end(); }
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const port = (server.address() as { port: number }).port;
  const base = `http://127.0.0.1:${port}`;
  const narration = "Every person has worth before achievement. Our teaching explores how this changes the way we treat one another.";
  const timings = narration.split(" ").map((word, index, all) => ({ word, startMs: index / all.length * 5800, endMs: (index + 1) / all.length * 5800 }));
  const input: VideoInput = {
    productionVersion: 2, scriptRevision: 1, title: "Human dignity in daily life", hook: "", brandName: "Beyond the Verse", headingFont: "Georgia", bodyFont: "Arial", primaryColor: "#16231c", accentColor: "#c89b3c", fps: 30,
    scenes: [
      { id: "presenter", presentation: "presenter", presenterVideoUrl: `${base}/presenter-fixture.mp4`, narration, narrationUrl: `${base}/audio.wav`, scriptureRef: null, durationInFrames: 180, timings },
      { id: "cutaway", presentation: "cutaway", visualUrl: `${base}/visual.svg`, narration, narrationUrl: `${base}/audio.wav`, scriptureRef: "Genesis 1:27", scriptureCards: [{ reference: "Genesis 1:27", translation: "WEB", text: "God created man in his own image. In God’s image he created him; male and female he created them.", startMs: 0, endMs: 5000 }], durationInFrames: 180, timings },
    ],
  };
  try {
    const serveUrl = await bundle({ entryPoint: resolve("packages/video/src/index.ts") });
    const browserExecutable = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
    for (const id of ["YouTubeLong", "YouTubeShort"]) {
      const composition = await selectComposition({ serveUrl, id, inputProps: input, browserExecutable });
      console.log(`Rendering ${id}`);
      for (const [name, frame] of [["presenter", 60], ["scripture", 210], ["end", 359]] as const) await renderStill({ serveUrl, composition, inputProps: input, frame, output: join(output, `${id}-${name}.png`), browserExecutable });
      await renderMedia({ serveUrl, composition, inputProps: input, outputLocation: join(output, `${id}.mp4`), codec: "h264", browserExecutable, crf: 28, concurrency: 1, frameRange: [120, 239], onProgress: ({ renderedFrames }) => { if (renderedFrames % 30 === 0) console.log(`${id}: ${renderedFrames}/120 frames`); } });
    }
    console.log(`Verified landscape and portrait compositions: ${output}`);
  } finally { server.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
