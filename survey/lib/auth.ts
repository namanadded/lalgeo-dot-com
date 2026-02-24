import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import { authDir, ensureDir, readJson, writeJson } from "./storage";

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: string;
}

const USERS_PATH = `${authDir()}/users.json`;
const COOKIE_NAME = "lalgeo_session";
const JWT_SECRET = process.env.LALGEO_JWT_SECRET || "dev-secret-change-me";

export function listUsers(): UserRecord[] {
  ensureDir(authDir());
  return readJson<UserRecord[]>(USERS_PATH, []);
}

export function hasUsers(): boolean {
  return listUsers().length > 0;
}

export function createUser(email: string, password: string): UserRecord {
  const existing = listUsers();
  if (existing.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
    throw new Error("User already exists.");
  }
  const record: UserRecord = {
    id: crypto.randomUUID(),
    email: email.toLowerCase(),
    passwordHash: bcrypt.hashSync(password, 10),
    createdAt: new Date().toISOString(),
  };
  writeJson(USERS_PATH, [...existing, record]);
  return record;
}

export function authenticate(email: string, password: string): UserRecord | null {
  const users = listUsers();
  const match = users.find((u) => u.email.toLowerCase() === email.toLowerCase());
  if (!match) return null;
  const ok = bcrypt.compareSync(password, match.passwordHash);
  return ok ? match : null;
}

export async function setSession(user: UserRecord) {
  const token = jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, { expiresIn: "7d" });
  const cookieStore = await cookies();
  cookieStore.set({
    name: COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.set({
    name: COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export async function getSessionUser(): Promise<{ id: string; email: string } | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { sub: string; email: string };
    return { id: payload.sub, email: payload.email };
  } catch {
    return null;
  }
}
