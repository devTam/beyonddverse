function origin(value: string | undefined, protocol = "https") {
  if (!value?.trim()) return null;
  try {
    return new URL(value.includes("://") ? value : `${protocol}://${value}`).origin;
  } catch {
    return null;
  }
}

export function authOrigins(env: NodeJS.ProcessEnv = process.env) {
  const values = [
    origin(env.BETTER_AUTH_URL),
    origin(env.VERCEL_PROJECT_PRODUCTION_URL),
    origin(env.VERCEL_URL),
    origin(env.VERCEL_BRANCH_URL),
    env.NODE_ENV !== "production" ? "http://localhost:3000" : null,
    env.NODE_ENV !== "production" ? "http://127.0.0.1:3000" : null,
  ];
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}
