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

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  // VERIFICACIÓN DE META
  if (req.method === "GET") {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    const expectedToken =
      process.env.WHATSAPP_VERIFY_TOKEN;

    if (
      mode === "subscribe" &&
      token === expectedToken
    ) {
      return res.status(200).send(challenge);
    }

    return res.status(403).send("Forbidden");
  }

  // MENSAJES ENTRANTES
  if (req.method === "POST") {
    const body = parseBody(req);

    try {
      const entries = body.entry || [];

      for (const entry of entries) {
        const changes = entry.changes || [];

        for (const change of changes) {
          if (change.field !== "messages") {
            continue;
          }

          const value = change.value || {};
          const messages = value.messages || [];

          for (const message of messages) {
            const from = message.from;

            // Solo nuestra prueba personal
            if (
              from !==
              process.env.WHATSAPP_TEST_RECIPIENT
            ) {
              continue;
            }

            if (message.type !== "text") {
              continue;
            }

            const accessToken =
              process.env.WHATSAPP_ACCESS_TOKEN;

            const phoneNumberId =
              process.env.WHATSAPP_PHONE_NUMBER_ID;

            if (!accessToken || !phoneNumberId) {
              console.error(
                "WhatsApp credentials missing"
              );
              continue;
            }

            const response = await fetch(
              `https://graph.facebook.com/v25.0/${phoneNumberId}/messages`,
              {
                method: "POST",

                headers: {
                  Authorization:
                    `Bearer ${accessToken}`,

                  "Content-Type":
                    "application/json",
                },

                body: JSON.stringify({
                  messaging_product:
                    "whatsapp",

                  recipient_type:
                    "individual",

                  to: from,

                  type: "text",

                  text: {
                    body:
                      "Hola Harold 👋 Automatización de WhatsApp funcionando ✅",
                  },
                }),
              }
            );

            if (!response.ok) {
              console.error(
                "WhatsApp send error:",
                await response.text()
              );
            }
          }
        }
      }

      return res.status(200).json({
        ok: true,
      });
    } catch (error) {
      console.error(
        "WhatsApp webhook error:",
        error
      );

      // Respondemos 200 para evitar
      // reintentos infinitos durante pruebas.
      return res.status(200).json({
        ok: false,
      });
    }
  }

  return res.status(405).json({
    ok: false,
    reason: "method_not_allowed",
  });
}
