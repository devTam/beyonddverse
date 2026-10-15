import { z } from "zod";
import { mediaBuffer, providerJson } from "./http";
import type { OAuthProvider, OAuthTokens, Publisher, PublishMedia } from "./types";

const TokenResponse = z.object({ access_token: z.string(), refresh_token: z.string().optional(), expires_in: z.number().optional(), scope: z.string().optional() });
const VideoResponse = z.object({ id: z.string(), status: z.object({ uploadStatus: z.string().optional(), privacyStatus: z.string().optional() }).optional() }).passthrough();

function credentials() {
  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET are required.");
  return { clientId, clientSecret };
}

export class YouTubeOAuth implements OAuthProvider {
  authorizationUrl(state: string, redirectUri: string, codeChallenge?: string) {
    const { clientId } = credentials();
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.search = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: "code", access_type: "offline", prompt: "consent", state, scope: "https://www.googleapis.com/auth/youtube https://www.googleapis.com/auth/yt-analytics.readonly", ...(codeChallenge ? { code_challenge: codeChallenge, code_challenge_method: "S256" } : {}) }).toString();
    return url;
  }
  async exchange(code: string, redirectUri: string, codeVerifier?: string) {
    const { clientId, clientSecret } = credentials();
    return this.token({ code, redirect_uri: redirectUri, grant_type: "authorization_code", client_id: clientId, client_secret: clientSecret, ...(codeVerifier ? { code_verifier: codeVerifier } : {}) });
  }
  async refresh(refreshToken: string) {
    const { clientId, clientSecret } = credentials();
    return this.token({ refresh_token: refreshToken, grant_type: "refresh_token", client_id: clientId, client_secret: clientSecret });
  }
  private async token(body: Record<string, string>): Promise<OAuthTokens> {
    const value = await providerJson("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body) }, TokenResponse);
    return { accessToken: value.access_token, refreshToken: value.refresh_token, expiresAt: value.expires_in ? new Date(Date.now() + value.expires_in * 1000) : undefined, scopes: value.scope?.split(" ") ?? [] };
  }
  async identity(accessToken: string) {
    const result = await providerJson("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", { headers: { authorization: `Bearer ${accessToken}` } }, z.object({ items: z.array(z.object({ id: z.string(), snippet: z.object({ title: z.string() }) })) }));
    const channel = result.items[0];
    if (!channel) throw new Error("The connected Google account has no YouTube channel.");
    return { externalId: channel.id, displayName: channel.snippet.title };
  }
}

export class YouTubePublisher implements Publisher {
  readonly platform = "YOUTUBE";
  validate(media: PublishMedia) {
    if (!media.mimeType.startsWith("video/")) throw new Error("YouTube requires a video asset.");
    if (media.title.length > 100) throw new Error("YouTube titles cannot exceed 100 characters.");
    if (media.description.length > 5_000) throw new Error("YouTube descriptions cannot exceed 5,000 characters.");
  }
  async publish(media: PublishMedia, accessToken: string) {
    this.validate(media);
    const privacyStatus = media.scheduledAt ? "private" : (media.privacyStatus ?? "unlisted");
    const metadata = { snippet: { title: media.title, description: media.description, categoryId: "27" }, status: { privacyStatus, selfDeclaredMadeForKids: false, ...(media.scheduledAt ? { publishAt: media.scheduledAt.toISOString() } : {}) } };
    const start = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", { method: "POST", headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json; charset=UTF-8", "x-upload-content-type": media.mimeType, "x-upload-content-length": String(media.bytes) }, body: JSON.stringify(metadata), signal: AbortSignal.timeout(60_000) });
    if (!start.ok) throw new Error(`YouTube upload initialization failed (${start.status}): ${(await start.text()).slice(0, 500)}`);
    const location = start.headers.get("location");
    if (!location) throw new Error("YouTube did not return a resumable upload URL.");
    const body = await mediaBuffer(media.url, 256 * 1024 * 1024 * 1024);
    const uploaded = await providerJson(location, { method: "PUT", headers: { "content-type": media.mimeType, "content-length": String(body.length) }, body }, VideoResponse);
    if (media.thumbnailUrl) {
      const thumbnail = await mediaBuffer(media.thumbnailUrl, 2 * 1024 * 1024);
      await providerJson(`https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${encodeURIComponent(uploaded.id)}&uploadType=media`, { method: "POST", headers: { authorization: `Bearer ${accessToken}`, "content-type": media.thumbnailMimeType ?? "image/jpeg", "content-length": String(thumbnail.length) }, body: thumbnail }, z.object({}).passthrough());
    }
    for (const playlistId of media.playlistIds ?? []) {
      await providerJson("https://www.googleapis.com/youtube/v3/playlistItems?part=snippet", { method: "POST", headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" }, body: JSON.stringify({ snippet: { playlistId, resourceId: { kind: "youtube#video", videoId: uploaded.id } } }) }, z.object({}).passthrough());
    }
    return { externalId: uploaded.id, url: `https://youtu.be/${uploaded.id}`, status: uploaded.status?.uploadStatus ?? "uploaded", raw: { ...uploaded, thumbnailApplied: Boolean(media.thumbnailUrl), playlists: media.playlistIds ?? [] } };
  }
  async reconcile(externalId: string, accessToken: string) {
    const result = await providerJson(`https://www.googleapis.com/youtube/v3/videos?part=status&id=${encodeURIComponent(externalId)}`, { headers: { authorization: `Bearer ${accessToken}` } }, z.object({ items: z.array(VideoResponse) }));
    const video = result.items[0];
    return { status: video?.status?.uploadStatus ?? "deleted", raw: video ?? {} };
  }
  async analytics(externalId: string, accessToken: string) {
    const end = new Date().toISOString().slice(0, 10); const start = new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10);
    const result = await providerJson(`https://youtubeanalytics.googleapis.com/v2/reports?ids=channel%3D%3DMINE&startDate=${start}&endDate=${end}&metrics=views,estimatedMinutesWatched,averageViewDuration,likes,comments,shares,subscribersGained&dimensions=video&filters=video%3D%3D${encodeURIComponent(externalId)}`, { headers: { authorization: `Bearer ${accessToken}` } }, z.object({ rows: z.array(z.array(z.union([z.string(), z.number()]))).optional() }).passthrough());
    const row = result.rows?.[0] ?? [];
    return { metrics: { views: Number(row[1] ?? 0), watchTimeMinutes: Number(row[2] ?? 0), averageViewDurationSeconds: Number(row[3] ?? 0), likes: Number(row[4] ?? 0), comments: Number(row[5] ?? 0), shares: Number(row[6] ?? 0), followersGained: Number(row[7] ?? 0) }, raw: result };
  }
  async revoke(accessToken: string) { await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(accessToken)}`, { method: "POST", signal: AbortSignal.timeout(30_000) }); }
}
