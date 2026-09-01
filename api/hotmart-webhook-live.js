import { createHash } from "crypto";
import { redis } from "./_redis.js";

const MAP_BASE_URL =
  "https://mapa-de-reconexion-personal.vercel.app";

const REAL_PRODUCT_ID = 8258558;

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

function normalizeEmail(email) {
  return (email || "")
    .toString()
    .trim()
    .toLowerCase();
}

function createToken(seed) {
  return (
    "hm-" +
    createHash("sha256")
      .update(seed)
      .digest("hex")
      .slice(0, 28)
  );
}

export default async function handler(
  req,
  res
) {
  res.setHeader(
    "Cache-Control",
    "no-store"
  );

  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      reason: "method_not_allowed",
    });
  }

  /*
   * Protección mínima para lanzamiento.
   * Hotmart envía este header en sus webhooks.
   *
   * Luego podemos endurecer la autenticación
   * validando el secreto completo.
   */
  const hottokHeader = (
    req.headers["x-hotmart-hottok"] || ""
  )
    .toString()
    .trim();

  if (!hottokHeader) {
    return res.status(401).json({
      ok: false,
      reason: "missing_hotmart_hottok",
    });
  }

  const body = parseBody(req);

  if (
    body.event !== "PURCHASE_APPROVED"
  ) {
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

  const productId =
    Number(product.id || 0);

  /*
   * Permitimos:
   * - producto REAL
   * - payload oficial de prueba de Hotmart
   */
  const isHotmartTest =
    productId === 0 &&
    product.name ===
      "Produto test postback2";

  if (
    productId !== REAL_PRODUCT_ID &&
    !isHotmartTest
  ) {
    return res.status(200).json({
      ok: true,
      ignored: true,
      reason: "different_product",
      productId,
    });
  }

  if (
    purchase.status &&
    purchase.status !== "APPROVED"
  ) {
    return res.status(200).json({
      ok: true,
      ignored: true,
      reason:
        "purchase_not_approved",
      status: purchase.status,
    });
  }

  const transaction = (
    purchase.transaction || ""
  )
    .toString()
    .trim();

  const email =
    normalizeEmail(buyer.email);

  if (!transaction) {
    return res.status(400).json({
      ok: false,
      reason: "missing_transaction",
    });
  }

  if (!email) {
    return res.status(400).json({
      ok: false,
      reason: "missing_buyer_email",
    });
  }

  try {
    /*
     * Hotmart reutiliza la misma
     * transacción en los payloads
     * de prueba.
     *
     * body.id permite que cada
     * prueba genere un acceso nuevo.
     */
    const seed = isHotmartTest
      ? `${transaction}:${
          body.id || Date.now()
        }`
      : transaction;

    const purchaseKey =
      isHotmartTest
        ? `hotmart-test-live:${
            body.id ||
            createHash("sha1")
              .update(seed)
              .digest("hex")
          }`
        : `hotmart-purchase:${transaction}`;

    const existingRaw =
      await redis.get(purchaseKey);

    const existing =
      parseStored(existingRaw);

    /*
     * Si Hotmart reintenta la misma
     * compra real no creamos otro token.
     */
    if (
      existing &&
      existing.accessUrl
    ) {
      await redis.set(
        `mapa-buyer:${email}`,
        purchaseKey
      );

      return res.status(200).json({
        ok: true,
        duplicate: true,
        test: isHotmartTest,
        transaction,
        token: existing.token,
        accessUrl:
          existing.accessUrl,
      });
    }

    const token =
      createToken(seed);

    const accessUrl =
      `${MAP_BASE_URL}/?token=${encodeURIComponent(
        token
      )}`;

    const record = {
      source: "hotmart",
      test: isHotmartTest,

      webhookEventId:
        body.id || null,

      event:
        body.event,

      transaction,

      productId,

      productName:
        product.name || null,

      buyerName:
        buyer.name || null,

      buyerFirstName:
        buyer.first_name || null,

      buyerLastName:
        buyer.last_name || null,

      buyerEmail:
        email,

      buyerPhone:
        buyer.checkout_phone || null,

      buyerPhoneCode:
        buyer.checkout_phone_code ||
        null,

      purchaseStatus:
        purchase.status || null,

      purchaseDate:
        purchase.approved_date ||
        purchase.order_date ||
        null,

      token,
      accessUrl,

      createdAt:
        new Date().toISOString(),

      mapUsed:
        false,

      mapUsedAt:
        null,
    };

    /*
     * Registro principal de la compra.
     */
    await redis.set(
      purchaseKey,
      JSON.stringify(record)
    );

    /*
     * Token -> compra.
     */
    await redis.set(
      `mapa-access:${token}`,
      JSON.stringify({
        transaction,
        purchaseKey,
      })
    );

    /*
     * Email -> compra más reciente.
     *
     * Esto permite recuperar el link
     * simplemente usando el correo
     * utilizado en Hotmart.
     */
    await redis.set(
      `mapa-buyer:${email}`,
      purchaseKey
    );

    return res.status(200).json({
      ok: true,
      test: isHotmartTest,
      transaction,
      token,
      accessUrl,
    });
  } catch (err) {
    console.error(
      "[hotmart-webhook-live] error:",
      err
    );

    return res.status(500).json({
      ok: false,
      reason: "internal_error",
    });
  }
}
