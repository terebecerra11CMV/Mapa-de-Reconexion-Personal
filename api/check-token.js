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

function getValidPersonalization(fullName, birthDate) {
  if (
    typeof fullName !== "string" ||
    typeof birthDate !== "string"
  ) {
    return null;
  }

  const normalizedName = fullName.trim();
  const normalizedBirthDate = birthDate.trim();
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(
    normalizedBirthDate
  );

  if (normalizedName.length < 3 || !match) {
    return null;
  }

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);

  if (
    month < 1 ||
    month > 12 ||
    year < 1900 ||
    year > new Date().getFullYear()
  ) {
    return null;
  }

  const daysInMonth = new Date(
    year,
    month,
    0
  ).getDate();

  if (day < 1 || day > daysInMonth) {
    return null;
  }

  return {
    fullName: normalizedName,
    birthDate: normalizedBirthDate
  };
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
    let purchase = null;

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

      purchase = parseStored(purchaseRaw);

      if (!purchase) {
        return res.status(200).json({
          valid: false,
          reason: "invalid"
        });
      }

    }

    /*
     * 3. Consultamos los dos registros de canje.
     * Esta ruta es solo de lectura: SETNX sigue
     * perteneciendo exclusivamente a redeem-token.
     */
    const redeemedRaw = await redis.get(
      `mapa-redeemed:${token}`
    );

    const legacyRaw = await redis.get(
      tokenKey(token)
    );

    const redeemed = parseStored(redeemedRaw);
    const legacy = parseStored(legacyRaw);

    const used = Boolean(
      (purchase && purchase.mapUsed === true) ||
      redeemedRaw ||
      legacyRaw
    );

    if (used) {
      const personalization =
        (purchase && purchase.mapUsed === true &&
          getValidPersonalization(
            purchase.mapFullName,
            purchase.mapBirthDate
          )) ||
        getValidPersonalization(
          redeemed && redeemed.fullName,
          redeemed && redeemed.birthDate
        ) ||
        getValidPersonalization(
          legacy && legacy.fullName,
          legacy && legacy.birthDate
        );

      if (personalization) {
        return res.status(200).json({
          valid: true,
          mode: "existing",
          fullName: personalization.fullName,
          birthDate: personalization.birthDate
        });
      }

      return res.status(200).json({
        valid: false,
        reason: "used_unrecoverable"
      });
    }

    return res.status(200).json({
      valid: true,
      mode: "new"
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
