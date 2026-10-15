import type { SocialAccount } from "@prisma/client";
import { FacebookPublisher, InstagramPublisher, MetaOAuth } from "./meta";
import { TikTokOAuth, TikTokPublisher } from "./tiktok";
import type { OAuthProvider, Publisher } from "./types";
import { YouTubeOAuth, YouTubePublisher } from "./youtube";

export type SupportedProvider = "youtube" | "meta" | "tiktok";
export function oauthProvider(provider: SupportedProvider): OAuthProvider { if (provider === "youtube") return new YouTubeOAuth(); if (provider === "meta") return new MetaOAuth(); return new TikTokOAuth(); }
export function publisherFor(account: SocialAccount): Publisher { if (account.platform === "YOUTUBE") return new YouTubePublisher(); if (account.platform === "INSTAGRAM") return new InstagramPublisher(account.externalId); if (account.platform === "FACEBOOK") return new FacebookPublisher(account.externalId); if (account.platform === "TIKTOK") return new TikTokPublisher(); throw new Error(`No official publisher is configured for ${account.platform}.`); }
