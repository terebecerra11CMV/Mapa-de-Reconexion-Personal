import { redis } from "./_redis.js";

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

  let body = req.body;

  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }

  const email =
    normalizeEmail(
      body && body.email
    );

  if (
    !email ||
    !email.includes("@")
  ) {
    return res.status(400).json({
      ok: false,
      reason: "invalid_email",
    });
  }

  try {
    /*
     * Encontramos qué compra
     * pertenece a este correo.
     */
    const purchaseKeyRaw =
      await redis.get(
        `mapa-buyer:${email}`
      );

    if (!purchaseKeyRaw) {
      return res.status(404).json({
        ok: false,
        reason:
          "purchase_not_found",
      });
    }

    const purchaseKey =
      typeof purchaseKeyRaw ===
      "string"
        ? purchaseKeyRaw
        : purchaseKeyRaw.toString();

    const purchaseRaw =
      await redis.get(
        purchaseKey
      );

    const purchase =
      parseStored(purchaseRaw);

    if (
      !purchase ||
      !purchase.accessUrl
    ) {
      return res.status(404).json({
        ok: false,
        reason:
          "access_not_found",
      });
    }

    return res.status(200).json({
      ok: true,

      buyerFirstName:
        purchase.buyerFirstName ||
        purchase.buyerName ||
        null,

      accessUrl:
        purchase.accessUrl,
    });
  } catch (err) {
    console.error(
      "[claim-access] error:",
      err
    );

    return res.status(500).json({
      ok: false,
      reason: "internal_error",
    });
  }
}
