// GET /api/check-token?token=XXXX
// Valida que el token exista y que todavía no haya sido consumido.

import { redis, tokenKey } from "./_redis.js";

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
  res.setHeader("Cache-Control", "no-store");

  const token = (req.query.token || "")
    .toString()
    .trim();

  if (!token) {
    return res.status(200).json({
      valid: false,
      reason: "missing"
    });
  }

  try {
    /*
     * 1. Para los tokens creados por Hotmart,
     * exigimos que hayan sido emitidos realmente
     * por nuestro webhook.
     */
    if (token.startsWith("hm-")) {
      const accessRaw = await redis.get(
        `mapa-access:${token}`
      );

      const access = parseStored(accessRaw);

      if (!access || !access.purchaseKey) {
        return res.status(200).json({
          valid: false,
          reason: "invalid"
        });
      }

      /*
       * 2. La compra es nuestra fuente principal
       * de verdad.
       */
      const purchaseRaw = await redis.get(
        access.purchaseKey
      );

      const purchase = parseStored(purchaseRaw);

      if (!purchase) {
        return res.status(200).json({
          valid: false,
          reason: "invalid"
        });
      }

      if (purchase.mapUsed === true) {
        return res.status(200).json({
          valid: false,
          reason: "used"
        });
      }
    }

    /*
     * 3. Candado nuevo.
     * Usamos una llave independiente y SETNX
     * para evitar un segundo canje.
     */
    const redeemed = await redis.get(
      `mapa-redeemed:${token}`
    );

    if (redeemed) {
      return res.status(200).json({
        valid: false,
        reason: "used"
      });
    }

    /*
     * 4. Compatibilidad con el mecanismo anterior.
     */
    const legacyUsed = await redis.get(
      tokenKey(token)
    );

    if (legacyUsed) {
      return res.status(200).json({
        valid: false,
        reason: "used"
      });
    }

    return res.status(200).json({
      valid: true
    });

  } catch (err) {
    console.error(
      "[check-token] error:",
      err
    );

    return res.status(500).json({
      valid: false,
      reason: "error"
    });
  }
}
