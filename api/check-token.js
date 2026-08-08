// GET /api/check-token?token=XXXX
// Consulta de solo lectura: NO marca el token como usado.
// Se usa al cargar la página para decidir si mostrar el formulario
// o el mensaje de "enlace ya utilizado".
import { redis, tokenKey } from "./_redis.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  const token = (req.query.token || "").toString().trim();

  if (!token) {
    return res.status(200).json({ valid: false, reason: "missing" });
  }

  try {
    const existing = await redis.get(tokenKey(token));
    if (existing) {
      return res.status(200).json({ valid: false, reason: "used" });
    }
    return res.status(200).json({ valid: true });
  } catch (err) {
    console.error("check-token error:", err);
    return res.status(500).json({ valid: false, reason: "error" });
  }
}
