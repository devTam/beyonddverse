export type PublishMedia = { url: string; bytes: number; mimeType: string; title: string; description: string; scheduledAt?: Date; thumbnailUrl?: string; thumbnailMimeType?: string; playlistIds?: string[] };
export type PublishResult = { externalId: string; url: string; status: string; raw: Record<string, unknown> };
export type AnalyticsMetrics = { views?: number; watchTimeMinutes?: number; averageViewDurationSeconds?: number; likes?: number; comments?: number; shares?: number; followersGained?: number };

export interface Publisher {
  readonly platform: string;
  validate(media: PublishMedia): void;
  publish(media: PublishMedia, accessToken: string): Promise<PublishResult>;
  reconcile(externalId: string, accessToken: string): Promise<{ status: string; raw: Record<string, unknown> }>;
  analytics(externalId: string, accessToken: string): Promise<{ metrics: AnalyticsMetrics; raw: Record<string, unknown> }>;
  revoke(accessToken: string): Promise<void>;
}

export type OAuthTokens = { accessToken: string; refreshToken?: string; expiresAt?: Date; scopes: string[] };
export interface OAuthProvider {
  authorizationUrl(state: string, redirectUri: string, codeChallenge?: string): URL;
  exchange(code: string, redirectUri: string, codeVerifier?: string): Promise<OAuthTokens>;
  identity(accessToken: string): Promise<{ externalId: string; displayName: string; metadata?: Record<string, unknown> }>;
  refresh(refreshToken: string): Promise<OAuthTokens>;
}
