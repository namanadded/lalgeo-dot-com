import jwt from "jsonwebtoken";

const COOKIE_NAME = "lalgeo_session";
const JWT_SECRET = process.env.LALGEO_JWT_SECRET || "dev-secret-change-me";

export function getSessionFromCookie(cookieHeader?: string | null): { id: string; email: string } | null {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(";").map((part) => part.trim());
  const tokenPart = parts.find((part) => part.startsWith(`${COOKIE_NAME}=`));
  if (!tokenPart) return null;
  const token = tokenPart.split("=")[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { sub: string; email: string };
    return { id: payload.sub, email: payload.email };
  } catch {
    return null;
  }
}
