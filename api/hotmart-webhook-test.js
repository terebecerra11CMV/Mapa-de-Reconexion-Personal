import { createHash } from "crypto";
import { redis } from "./_redis.js";

const MAP_BASE_URL =
  "https://mapa-de-reconexion-personal.vercel.app";

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

function createToken(transaction, eventId) {
  return (
    "hm-test-" +
    createHash("sha256")
      .update(`${transaction}:${eventId}`)
      .digest("hex")
      .slice(0, 24)
  );
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      reason: "method_not_allowed",
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

  const transaction = (
    purchase.transaction || ""
  )
    .toString()
    .trim();

  const eventId = (
    body.id ||
    Date.now().toString()
  )
    .toString()
    .trim();

  if (!transaction) {
    return res.status(400).json({
      ok: false,
      reason: "missing_transaction",
    });
  }

  /*
   * Este endpoint existe EXCLUSIVAMENTE
   * para las pruebas simuladas de Hotmart.
   *
   * El payload de prueba de Hotmart usa
   * el producto "Produto test postback2".
   */
  if (
    product.id !== 0 &&
    product.name !== "Produto test postback2"
  ) {
    return res.status(403).json({
      ok: false,
      reason: "not_test_payload",
    });
  }

  try {
    const purchaseKey =
      `hotmart-test:${eventId}`;

    const existingRaw =
      await redis.get(purchaseKey);

    const existing =
      parseStored(existingRaw);

    if (
      existing &&
      existing.accessUrl
    ) {
      return res.status(200).json({
        ok: true,
        test: true,
        duplicate: true,
        transaction,
        token: existing.token,
        accessUrl: existing.accessUrl,
      });
    }

    const token =
      createToken(transaction, eventId);

    const accessUrl =
      `${MAP_BASE_URL}/?token=${encodeURIComponent(token)}`;

    const record = {
      test: true,
      source: "hotmart",
      event: body.event,
      eventId,

      transaction,

      productId:
        product.id ?? null,

      productName:
        product.name || null,

      buyerName:
        buyer.name || null,

      buyerEmail:
        buyer.email || null,

      buyerPhone:
        buyer.checkout_phone || null,

      buyerPhoneCode:
        buyer.checkout_phone_code || null,

      purchaseStatus:
        purchase.status || null,

      token,
      accessUrl,

      createdAt:
        new Date().toISOString(),
    };

    await redis.set(
      purchaseKey,
      JSON.stringify(record)
    );

    await redis.set(
      `mapa-access:${token}`,
      JSON.stringify({
        test: true,
        transaction,
        purchaseKey,
      })
    );

    console.log(
      "[hotmart-test] Prueba recibida",
      {
        transaction,
        eventId,
        token,
      }
    );

    return res.status(200).json({
      ok: true,
      test: true,
      message:
        "Hotmart -> Vercel -> Redis funcionando",
      transaction,
      token,
      accessUrl,
    });
  } catch (err) {
    console.error(
      "[hotmart-test] error:",
      err
    );

    return res.status(500).json({
      ok: false,
      reason: "internal_error",
    });
  }
}
