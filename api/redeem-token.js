// POST /api/redeem-token  { token: "XXXX" }
// Operación atómica: "SET si no existe" (NX). Si el token ya existía,
// Redis regresa null y NO se sobreescribe -> el segundo intento falla.
// Esto evita condiciones de carrera (dos pestañas enviando el mismo
// token al mismo tiempo).
import { redis, tokenKey } from "./_redis.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, reason: "method_not_allowed" });
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch (e) {
      body = {};
    }
  }
  const token = ((body && body.token) || "").toString().trim();

  if (!token) {
    return res.status(400).json({ ok: false, reason: "missing" });
  }

  try {
    const record = JSON.stringify({ usedAt: new Date().toISOString() });
    // nx: true => solo escribe si la llave NO existe todavía.
    const claimed = await redis.set(tokenKey(token), record, { nx: true });

    if (!claimed) {
      return res.status(409).json({ ok: false, reason: "used" });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("redeem-token error:", err);
    return res.status(500).json({ ok: false, reason: "error" });
  }
}
