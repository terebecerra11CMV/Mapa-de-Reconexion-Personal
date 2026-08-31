import { createHash } from "crypto";
import { redis } from "./_redis.js";

const MAP_BASE_URL = "https://mapa-de-reconexion-personal.vercel.app";

function parseBody(req) {
  if (!req.body) return {};

  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }

  return req.body;
}

function parseStored(value) {
  if (!value) return null;

  if (typeof value === "object") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function createToken(transaction) {
  const hash = createHash("sha256")
    .update(transaction)
    .digest("hex")
    .slice(0, 24);

  return `hm-${hash}`;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      reason: "method_not_allowed",
    });
  }

  const expectedHottok = (process.env.HOTMART_HOTTOK || "").trim();
  const receivedHottok = (
    req.headers["x-hotmart-hottok"] || ""
  )
    .toString()
    .trim();

  if (!expectedHottok) {
    console.error("[hotmart-webhook] HOTMART_HOTTOK no configurado");

    return res.status(500).json({
      ok: false,
      reason: "server_not_configured",
    });
  }

  if (!receivedHottok || receivedHottok !== expectedHottok) {
    console.warn("[hotmart-webhook] Hottok inválido");

    return res.status(401).json({
      ok: false,
      reason: "invalid_hottok",
    });
  }

  const body = parseBody(req);

  if (body.event !== "PURCHASE_APPROVED") {
    return res.status(200).json({
      ok: true,
      ignored: true,
      event: body.event || null,
    });
  }

  const data = body.data || {};
  const purchase = data.purchase || {};
  const buyer = data.buyer || {};
  const product = data.product || {};

  const transaction = (purchase.transaction || "").toString().trim();

  if (!transaction) {
    return res.status(400).json({
      ok: false,
      reason: "missing_transaction",
    });
  }

  try {
    const purchaseKey = `hotmart-purchase:${transaction}`;

    const existingRaw = await redis.get(purchaseKey);
    const existing = parseStored(existingRaw);

    if (existing && existing.accessUrl) {
      return res.status(200).json({
        ok: true,
        duplicate: true,
        transaction,
        token: existing.token,
        accessUrl: existing.accessUrl,
      });
    }

    const token = createToken(transaction);
    const accessUrl =
      `${MAP_BASE_URL}/?token=${encodeURIComponent(token)}`;

    const record = {
      source: "hotmart",
      event: body.event,

      transaction,

      productId: product.id || null,
      productName: product.name || null,

      buyerName: buyer.name || null,
      buyerFirstName: buyer.first_name || null,
      buyerLastName: buyer.last_name || null,
      buyerEmail: buyer.email || null,
      buyerPhone: buyer.checkout_phone || null,
      buyerPhoneCode: buyer.checkout_phone_code || null,

      purchaseStatus: purchase.status || null,
      purchaseDate:
        purchase.approved_date ||
        purchase.order_date ||
        null,

      token,
      accessUrl,

      createdAt: new Date().toISOString(),

      mapUsed: false,
      mapUsedAt: null,
      mapFullName: null,
      mapBirthDate: null,
    };

    await redis.set(
      purchaseKey,
      JSON.stringify(record)
    );

    await redis.set(
      `mapa-access:${token}`,
      JSON.stringify({
        transaction,
        purchaseKey,
      })
    );

    console.log(
      "[hotmart-webhook] Acceso creado",
      transaction,
      token
    );

    return res.status(200).json({
      ok: true,
      transaction,
      token,
      accessUrl,
    });
  } catch (err) {
    console.error("[hotmart-webhook] error:", err);

    return res.status(500).json({
      ok: false,
      reason: "internal_error",
    });
  }
}
