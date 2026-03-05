import { NextResponse } from "next/server";
import crypto from "crypto";
import { markInvoicePaid } from "@/lib/saas-store";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const signingSecret = (process.env.STRIPE_WEBHOOK_SECRET || "").trim();
  if (!signingSecret) {
    return NextResponse.json({ error: "Missing STRIPE_WEBHOOK_SECRET" }, { status: 500 });
  }

  const signature = req.headers.get("stripe-signature") || "";
  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  const payload = await req.text();

  const parts = signature.split(",").map((part) => part.trim());
  const timestamp = parts.find((part) => part.startsWith("t="))?.slice(2) || "";
  const sentV1 = parts.find((part) => part.startsWith("v1="))?.slice(3) || "";
  if (!timestamp || !sentV1) {
    return NextResponse.json({ error: "Invalid Stripe signature header format" }, { status: 400 });
  }

  const signedPayload = `${timestamp}.${payload}`;
  const expected = crypto.createHmac("sha256", signingSecret).update(signedPayload).digest("hex");
  const valid =
    expected.length === sentV1.length &&
    crypto.timingSafeEqual(Buffer.from(expected, "utf8"), Buffer.from(sentV1, "utf8"));

  if (!valid) {
    return NextResponse.json({ error: "Invalid Stripe signature" }, { status: 400 });
  }

  let event: {
    type?: string;
    data?: { object?: Record<string, unknown> };
  };
  try {
    event = JSON.parse(payload) as {
      type?: string;
      data?: { object?: Record<string, unknown> };
    };
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = (event.data?.object || {}) as {
      id?: string;
      payment_intent?: string;
      client_reference_id?: string;
      metadata?: Record<string, string>;
    };
    const organizationId = String(session.metadata?.organizationId || "").trim();
    const invoiceId = String(session.metadata?.invoiceId || session.client_reference_id || "").trim();

    if (organizationId && invoiceId) {
      try {
        await markInvoicePaid(organizationId, invoiceId, {
          paidAt: new Date(),
          provider: "stripe",
          paymentReference: session.payment_intent ? String(session.payment_intent) : String(session.id || ""),
        });
      } catch (error) {
        console.error("[stripe-webhook] Failed to mark invoice paid", {
          organizationId,
          invoiceId,
          error,
        });
      }
    }
  }

  return NextResponse.json({ received: true });
}
