export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "GET") {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    const expectedToken =
      process.env.WHATSAPP_VERIFY_TOKEN;

    if (!expectedToken) {
      return res.status(500).send(
        "WHATSAPP_VERIFY_TOKEN is not configured"
      );
    }

    if (
      mode === "subscribe" &&
      token === expectedToken
    ) {
      return res.status(200).send(challenge);
    }

    return res.status(403).send("Forbidden");
  }

  if (req.method === "POST") {
    // Por ahora solo confirmamos recepción.
    // No procesamos mensajes todavía.
    return res.status(200).json({
      ok: true,
    });
  }

  return res.status(405).json({
    ok: false,
    reason: "method_not_allowed",
  });
}
