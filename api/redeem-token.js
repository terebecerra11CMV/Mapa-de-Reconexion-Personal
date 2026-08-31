// POST /api/redeem-token
// {
//   token: "XXXX",
//   fullName: "Nombre Apellido",
//   birthDate: "DD/MM/YYYY"
// }
//
// Marca el token como utilizado una sola vez.
// Si el token fue generado desde Hotmart, también actualiza
// el registro de la compra con los datos usados para crear el mapa.

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

  const token = ((body && body.token) || "").toString().trim();
  const fullName = ((body && body.fullName) || "").toString().trim();
  const birthDate = ((body && body.birthDate) || "").toString().trim();

  if (!token) {
    return res.status(400).json({
      ok: false,
      reason: "missing_token",
    });
  }

  try {
    const usedAt = new Date().toISOString();

    // Mantiene exactamente el comportamiento original:
    // el primer uso gana y cualquier segundo intento falla.
    const tokenRecord = JSON.stringify({
      usedAt,
      fullName: fullName || null,
      birthDate: birthDate || null,
    });

    const claimed = await redis.set(
      tokenKey(token),
      tokenRecord,
      { nx: true }
    );

    if (!claimed) {
      return res.status(409).json({
        ok: false,
        reason: "used",
      });
    }

    // Si este token provino de una compra de Hotmart,
    // buscamos la compra asociada.
    try {
      const accessRaw = await redis.get(`mapa-access:${token}`);
      const access = parseStored(accessRaw);

      if (access && access.purchaseKey) {
        const purchaseRaw = await redis.get(access.purchaseKey);
        const purchase = parseStored(purchaseRaw);

        if (purchase) {
          purchase.mapUsed = true;
          purchase.mapUsedAt = usedAt;
          purchase.mapFullName = fullName || null;
          purchase.mapBirthDate = birthDate || null;

          await redis.set(
            access.purchaseKey,
            JSON.stringify(purchase)
          );
        }
      }
    } catch (linkErr) {
      // No bloqueamos la generación del mapa si falla
      // solamente el enriquecimiento del registro.
      console.error(
        "[redeem-token] No se pudo actualizar compra Hotmart:",
        linkErr
      );
    }

    return res.status(200).json({
      ok: true,
    });
  } catch (err) {
    console.error("redeem-token error:", err);

    return res.status(500).json({
      ok: false,
      reason: "error",
    });
  }
}
