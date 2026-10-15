import { z } from "zod";
import { mediaBuffer, providerJson } from "./http";
import type { OAuthProvider, OAuthTokens, PublishMedia, Publisher } from "./types";

const API = "https://api.x.com/2";
const Token = z.object({ access_token: z.string(), refresh_token: z.string().optional(), expires_in: z.number().optional(), scope: z.string().optional() });
const Post = z.object({ data: z.object({ id: z.string(), text: z.string().optional(), public_metrics: z.object({ impression_count: z.number().optional(), like_count: z.number().optional(), reply_count: z.number().optional(), repost_count: z.number().optional(), quote_count: z.number().optional(), bookmark_count: z.number().optional() }).optional(), non_public_metrics: z.record(z.string(), z.number()).optional() }) });
const Media = z.object({ data: z.object({ id: z.string().optional(), media_id: z.string().optional(), media_key: z.string().optional(), processing_info: z.object({ state: z.string(), check_after_secs: z.number().optional(), error: z.unknown().optional() }).optional() }) });

function credentials() {
  const clientId = process.env.X_CLIENT_ID;
  if (!clientId) throw new Error("X_CLIENT_ID is required.");
  return { clientId, clientSecret: process.env.X_CLIENT_SECRET };
}

async function token(body: Record<string, string>): Promise<OAuthTokens> {
  const { clientId, clientSecret } = credentials();
  const headers: Record<string, string> = { "content-type": "application/x-www-form-urlencoded" };
  if (clientSecret) headers.authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
  else body.client_id = clientId;
  const result = await providerJson(`${API}/oauth2/token`, { method: "POST", headers, body: new URLSearchParams(body) }, Token);
  return { accessToken: result.access_token, refreshToken: result.refresh_token, expiresAt: result.expires_in ? new Date(Date.now() + result.expires_in * 1000) : undefined, scopes: result.scope?.split(" ").filter(Boolean) ?? [] };
}

export class XOAuth implements OAuthProvider {
  authorizationUrl(state: string, redirectUri: string, codeChallenge?: string) {
    const { clientId } = credentials();
    if (!codeChallenge) throw new Error("X OAuth requires PKCE.");
    const url = new URL("https://x.com/i/oauth2/authorize");
    url.search = new URLSearchParams({ response_type: "code", client_id: clientId, redirect_uri: redirectUri, scope: "tweet.read tweet.write users.read media.write offline.access", state, code_challenge: codeChallenge, code_challenge_method: "S256" }).toString();
    return url;
  }
  exchange(code: string, redirectUri: string, codeVerifier?: string) {
    if (!codeVerifier) throw new Error("X OAuth code verifier is missing.");
    return token({ code, grant_type: "authorization_code", redirect_uri: redirectUri, code_verifier: codeVerifier });
  }
  async identity(accessToken: string) {
    const result = await providerJson(`${API}/users/me?user.fields=username,name`, { headers: { authorization: `Bearer ${accessToken}` } }, z.object({ data: z.object({ id: z.string(), name: z.string(), username: z.string() }) }));
    return { externalId: result.data.id, displayName: `@${result.data.username}`, metadata: { name: result.data.name, username: result.data.username } };
  }
  refresh(refreshToken: string) { return token({ refresh_token: refreshToken, grant_type: "refresh_token" }); }
}

async function uploadMedia(media: PublishMedia, accessToken: string) {
  const body = await mediaBuffer(media.url, 512 * 1024 * 1024);
  const form = new FormData();
  form.set("media", new Blob([body], { type: media.mimeType }), media.title.replace(/[^a-z0-9.-]+/gi, "-").slice(0, 80));
  form.set("media_category", media.mimeType.startsWith("video/") ? "tweet_video" : "tweet_image");
  let result = await providerJson(`${API}/media/upload`, { method: "POST", headers: { authorization: `Bearer ${accessToken}` }, body: form }, Media);
  const id = result.data.id ?? result.data.media_id ?? result.data.media_key;
  if (!id) throw new Error("X media upload did not return a media identifier.");
  for (let attempt = 0; result.data.processing_info && !["succeeded", "failed"].includes(result.data.processing_info.state.toLowerCase()) && attempt < 30; attempt++) {
    const delaySeconds = Math.min(Math.max(result.data.processing_info.check_after_secs ?? 1, 1), 10);
    await new Promise((resolve) => setTimeout(resolve, delaySeconds * 1_000));
    result = await providerJson(`${API}/media/upload?command=STATUS&media_id=${encodeURIComponent(id)}`, { headers: { authorization: `Bearer ${accessToken}` } }, Media);
  }
  if (result.data.processing_info?.state.toLowerCase() === "failed") throw new Error(`X media processing failed: ${JSON.stringify(result.data.processing_info.error ?? {})}`);
  if (result.data.processing_info && result.data.processing_info.state.toLowerCase() !== "succeeded") throw new Error("X media processing did not finish before the timeout.");
  return id;
}

export class XPublisher implements Publisher {
  readonly platform = "X";
  validate(media: PublishMedia) {
    const posts = media.posts?.length ? media.posts : [media.description];
    if (!posts.length || posts.some((post) => !post.trim() || post.length > 280)) throw new Error("Each X post must contain 1–280 characters.");
    if (media.bytes > 512 * 1024 * 1024) throw new Error("X media exceeds the configured 512 MB upload limit.");
  }
  async publish(media: PublishMedia, accessToken: string) {
    this.validate(media);
    const posts = media.posts?.length ? media.posts : [media.description];
    const mediaId = media.bytes > 0 ? await uploadMedia(media, accessToken) : undefined;
    const ids: string[] = [];
    let replyTo: string | undefined;
    for (const [index, text] of posts.entries()) {
      const result = await providerJson(`${API}/tweets`, { method: "POST", headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" }, body: JSON.stringify({ text, made_with_ai: true, ...(index === 0 && mediaId ? { media: { media_ids: [mediaId] } } : {}), ...(replyTo ? { reply: { in_reply_to_tweet_id: replyTo } } : {}) }) }, z.object({ data: z.object({ id: z.string(), text: z.string().optional() }) }));
      ids.push(result.data.id);
      replyTo = result.data.id;
    }
    return { externalId: ids[0], url: `https://x.com/i/web/status/${ids[0]}`, status: "published", raw: { ids } };
  }
  async reconcile(externalId: string, accessToken: string) {
    const result = await providerJson(`${API}/tweets/${encodeURIComponent(externalId)}`, { headers: { authorization: `Bearer ${accessToken}` } }, Post);
    return { status: "published", raw: result };
  }
  async analytics(externalId: string, accessToken: string) {
    const result = await providerJson(`${API}/tweets/${encodeURIComponent(externalId)}?tweet.fields=public_metrics,non_public_metrics`, { headers: { authorization: `Bearer ${accessToken}` } }, Post);
    const metrics = result.data.public_metrics ?? {};
    return { metrics: { views: metrics.impression_count, likes: metrics.like_count, comments: metrics.reply_count, shares: (metrics.repost_count ?? 0) + (metrics.quote_count ?? 0), saves: metrics.bookmark_count }, raw: result };
  }
  async revoke(accessToken: string) {
    const { clientId, clientSecret } = credentials();
    const headers: Record<string, string> = { "content-type": "application/x-www-form-urlencoded" };
    if (clientSecret) headers.authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
    const response = await fetch(`${API}/oauth2/revoke`, { method: "POST", headers, body: new URLSearchParams({ token: accessToken, token_type_hint: "access_token", ...(!clientSecret ? { client_id: clientId } : {}) }), signal: AbortSignal.timeout(60_000) });
    if (!response.ok) throw new Error(`X token revocation failed (${response.status}).`);
  }
}
