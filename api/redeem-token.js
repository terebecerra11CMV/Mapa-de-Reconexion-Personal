import {
  redis,
  tokenKey
} from "./_redis.js";

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

export default async function handler(req, res) {
  res.setHeader(
    "Cache-Control",
    "no-store"
  );

  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      reason: "method_not_allowed"
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

  const token = (
    (body && body.token) || ""
  )
    .toString()
    .trim();

  const fullName = (
    (body && body.fullName) || ""
  )
    .toString()
    .trim();

  const birthDate = (
    (body && body.birthDate) || ""
  )
    .toString()
    .trim();

  if (!token) {
    return res.status(400).json({
      ok: false,
      reason: "missing_token"
    });
  }

  try {
    let access = null;
    let purchase = null;

    /*
     * TOKENS HOTMART:
     * antes de permitir el canje comprobamos
     * que realmente hayan sido creados
     * por nuestro webhook.
     */
    if (token.startsWith("hm-")) {
      const accessRaw = await redis.get(
        `mapa-access:${token}`
      );

      access = parseStored(accessRaw);

      if (!access || !access.purchaseKey) {
        return res.status(403).json({
          ok: false,
          reason: "invalid_token"
        });
      }

      const purchaseRaw = await redis.get(
        access.purchaseKey
      );

      purchase = parseStored(
        purchaseRaw
      );

      if (!purchase) {
        return res.status(403).json({
          ok: false,
          reason: "invalid_purchase"
        });
      }

      /*
       * Segunda línea de defensa.
       */
      if (purchase.mapUsed === true) {
        return res.status(409).json({
          ok: false,
          reason: "used"
        });
      }
    }

    const usedAt =
      new Date().toISOString();

    /*
     * CANDADO REAL.
     *
     * SETNX es explícitamente:
     * "crear solamente si todavía no existe".
     *
     * 1 = nosotros fuimos el primer uso.
     * 0 = alguien ya consumió este token.
     */
    const claimed = await redis.setnx(
      `mapa-redeemed:${token}`,
      JSON.stringify({
        usedAt,
        fullName:
          fullName || null,
        birthDate:
          birthDate || null
      })
    );

    if (!claimed) {
      return res.status(409).json({
        ok: false,
        reason: "used"
      });
    }

    /*
     * También mantenemos la llave antigua
     * para compatibilidad con el sistema.
     */
    await redis.set(
      tokenKey(token),
      JSON.stringify({
        usedAt,
        fullName:
          fullName || null,
        birthDate:
          birthDate || null
      })
    );

    /*
     * Actualizamos el registro de compra.
     */
    if (
      access &&
      access.purchaseKey &&
      purchase
    ) {
      purchase.mapUsed = true;
      purchase.mapUsedAt = usedAt;

      purchase.mapFullName =
        fullName || null;

      purchase.mapBirthDate =
        birthDate || null;

      await redis.set(
        access.purchaseKey,
        JSON.stringify(purchase)
      );
    }

    return res.status(200).json({
      ok: true
    });

  } catch (err) {
    console.error(
      "[redeem-token] error:",
      err
    );

    return res.status(500).json({
      ok: false,
      reason: "error"
    });
  }
}
