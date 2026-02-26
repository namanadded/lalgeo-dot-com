import { authDir, ensureDir, readJson, writeJson } from "@/lib/storage";
import { randomUUID } from "node:crypto";

export type CouponType = "percent" | "fixed" | "trial";

export interface CouponRecord {
  id: string;
  code: string;
  type: CouponType;
  value: number;
  maxUses: number | null;
  usedCount: number;
  active: boolean;
  createdAt: string;
}

const COUPONS_PATH = `${authDir()}/coupons.json`;

export function listCoupons(): CouponRecord[] {
  ensureDir(authDir());
  return readJson<CouponRecord[]>(COUPONS_PATH, []).sort((a, b) =>
    a.createdAt < b.createdAt ? 1 : -1,
  );
}

export function createCoupon(input: {
  code: string;
  type: CouponType;
  value: number;
  maxUses?: number | null;
}): CouponRecord {
  const code = input.code.trim().toUpperCase();
  if (!code) throw new Error("Coupon code is required.");

  const existing = listCoupons();
  if (existing.some((coupon) => coupon.code === code)) {
    throw new Error("Coupon code already exists.");
  }

  const record: CouponRecord = {
    id: randomUUID(),
    code,
    type: input.type,
    value: Math.max(0, input.value),
    maxUses:
      typeof input.maxUses === "number" && Number.isFinite(input.maxUses) && input.maxUses > 0
        ? Math.floor(input.maxUses)
        : null,
    usedCount: 0,
    active: true,
    createdAt: new Date().toISOString(),
  };

  writeJson(COUPONS_PATH, [...existing, record]);
  return record;
}

export function setCouponActive(id: string, active: boolean) {
  const existing = listCoupons();
  const next = existing.map((coupon) => (coupon.id === id ? { ...coupon, active } : coupon));
  writeJson(COUPONS_PATH, next);
}
