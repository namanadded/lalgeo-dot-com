export function appBasePath() {
  return "";
}

export function appOrigin() {
  const fromEnv = (process.env.APP_URL || "").trim();
  if (fromEnv) {
    try {
      const parsed = new URL(fromEnv);
      return `${parsed.protocol}//${parsed.host}`;
    } catch {
      // Fall through to localhost default
    }
  }
  return "http://localhost:3000";
}

export function appUrl(pathname: string) {
  const origin = appOrigin();
  const basePath = appBasePath();
  const normalizedPath = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const finalPath = normalizedPath.startsWith(`${basePath}/`) || normalizedPath === basePath ? normalizedPath : `${basePath}${normalizedPath}`;
  return `${origin}${finalPath}`;
}
