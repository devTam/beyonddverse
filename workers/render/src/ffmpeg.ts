import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";

const exec = promisify(execFile);
const ProbeSchema = z.object({ format: z.object({ duration: z.coerce.number().positive(), size: z.coerce.number().positive() }), streams: z.array(z.object({ codec_type: z.string(), codec_name: z.string().optional(), width: z.number().optional(), height: z.number().optional() })) });

export async function probeMedia(path: string) {
  const { stdout } = await exec("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", path], { maxBuffer: 10 * 1024 * 1024 });
  return ProbeSchema.parse(JSON.parse(stdout));
}

export async function normalizeAudio(input: string, output: string) {
  await exec("ffmpeg", ["-y", "-i", input, "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-ar", "48000", output]);
}

export async function trimMedia(input: string, output: string, startSeconds: number, durationSeconds: number) {
  await exec("ffmpeg", ["-y", "-ss", String(startSeconds), "-i", input, "-t", String(durationSeconds), "-c", "copy", output]);
}

export async function convertMedia(input: string, output: string) {
  await exec("ffmpeg", ["-y", "-i", input, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-movflags", "+faststart", output]);
}

export async function extractThumbnail(input: string, output: string, atSeconds = 1) {
  await exec("ffmpeg", ["-y", "-ss", String(atSeconds), "-i", input, "-frames:v", "1", "-q:v", "2", output]);
}
