import { describe, expect, it } from "vitest";
import { cloudinaryResourceTypeFor, cloudinarySafeStem } from "./cloudinary-utils";

describe("Cloudinary storage mapping", () => {
  it("maps images, video, audio, and documents to Cloudinary resource types", () => {
    expect(cloudinaryResourceTypeFor("image/webp")).toBe("image");
    expect(cloudinaryResourceTypeFor("video/mp4")).toBe("video");
    expect(cloudinaryResourceTypeFor("audio/mpeg")).toBe("video");
    expect(cloudinaryResourceTypeFor("text/vtt")).toBe("raw");
  });

  it("normalizes unsafe filenames before creating public IDs", () => {
    expect(cloudinarySafeStem("Genesis 1 — Final!.mp4")).toBe("Genesis-1-Final");
    expect(cloudinarySafeStem("../.mp4")).toBe("asset");
  });
});
