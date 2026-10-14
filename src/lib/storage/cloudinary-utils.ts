export type CloudinaryResourceType = "image" | "video" | "raw";

export function cloudinaryResourceTypeFor(mimeType: string): CloudinaryResourceType {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/") || mimeType.startsWith("audio/")) return "video";
  return "raw";
}

export function cloudinarySafeStem(filename: string) {
  return filename
    .replace(/\.[^.]+$/, "")
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "asset";
}
