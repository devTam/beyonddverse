import "server-only";

import { APIError, betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { prisma } from "@/lib/prisma";

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: { enabled: true, minPasswordLength: 12 },
  session: { cookieCache: { enabled: true, maxAge: 5 * 60 } },
  advanced: { database: { generateId: "uuid", joins: true } },
  databaseHooks: {
    user: { create: { before: async (user) => {
      const administratorEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
      if (!administratorEmail || user.email.toLowerCase() !== administratorEmail) {
        throw new APIError("FORBIDDEN", { message: "This studio only permits the configured administrator." });
      }
      return { data: { ...user, emailVerified: true } };
    } } },
  },
  plugins: [nextCookies()],
});

export async function requireUser(requestHeaders: Headers) {
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session) throw new APIError("UNAUTHORIZED", { message: "Authentication required." });
  return session;
}
