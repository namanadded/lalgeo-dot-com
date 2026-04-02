import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import { authDir, ensureDir, readJson, writeJson } from "./storage";

export type UserRole = "admin" | "staff";

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  createdAt: string;
}

const USERS_PATH = `${authDir()}/users.json`;
const COOKIE_NAME = "lalgeo_session";
const JWT_SECRET = process.env.LALGEO_JWT_SECRET || "dev-secret-change-me";

function normalizeRole(value: unknown): UserRole {
  return value === "staff" ? "staff" : "admin";
}

function normalizeUserRecord(input: Omit<UserRecord, "role"> & { role?: unknown }): UserRecord {
  return {
    ...input,
    role: normalizeRole(input.role),
  };
}

function saveUsers(users: UserRecord[]) {
  writeJson(USERS_PATH, users);
}

export function listUsers(): UserRecord[] {
  ensureDir(authDir());
  const users = readJson<Array<Omit<UserRecord, "role"> & { role?: unknown }>>(USERS_PATH, []);
  const normalized = users.map(normalizeUserRecord);
  if (normalized.some((user, index) => user.role !== users[index]?.role)) {
    saveUsers(normalized);
  }
  return normalized;
}

export function hasUsers(): boolean {
  return listUsers().length > 0;
}

export function countAdmins(): number {
  return listUsers().filter((user) => user.role === "admin").length;
}

export function createUser(email: string, password: string, role: UserRole = "staff"): UserRecord {
  const existing = listUsers();
  if (existing.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
    throw new Error("User already exists.");
  }
  const record: UserRecord = {
    id: crypto.randomUUID(),
    email: email.toLowerCase(),
    passwordHash: bcrypt.hashSync(password, 10),
    role,
    createdAt: new Date().toISOString(),
  };
  saveUsers([...existing, record]);
  return record;
}

export function authenticate(email: string, password: string): UserRecord | null {
  const users = listUsers();
  const match = users.find((u) => u.email.toLowerCase() === email.toLowerCase());
  if (!match) return null;
  const ok = bcrypt.compareSync(password, match.passwordHash);
  return ok ? match : null;
}

export function getUserById(userId: string): UserRecord | null {
  return listUsers().find((user) => user.id === userId) || null;
}

export function updateUserRole(userId: string, role: UserRole) {
  const users = listUsers();
  const target = users.find((user) => user.id === userId);
  if (!target) {
    throw new Error("User not found.");
  }
  if (target.role === role) return target;
  if (target.role === "admin" && role !== "admin" && countAdmins() <= 1) {
    throw new Error("At least one admin account is required.");
  }
  const updated = users.map((user) => (user.id === userId ? { ...user, role } : user));
  saveUsers(updated);
  return updated.find((user) => user.id === userId) || null;
}

export async function setSession(user: UserRecord) {
  const token = jwt.sign({ sub: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: "7d" });
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

export async function getSessionUser(): Promise<{ id: string; email: string; role: UserRole } | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { sub: string; email: string; role?: unknown };
    const userFromStore = getUserById(payload.sub);
    const role = userFromStore?.role || normalizeRole(payload.role);
    return { id: payload.sub, email: payload.email, role };
  } catch {
    return null;
  }
}
