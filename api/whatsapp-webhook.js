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

function normalizePhone(value) {
  return (value || "")
    .toString()
    .replace(/\D/g, "");
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

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

  if (req.method === "POST") {
    const body = parseBody(req);

    try {
      const entries = body.entry || [];

      for (const entry of entries) {
        const changes = entry.changes || [];

        for (const change of changes) {
          const value = change.value || {};
          const messages = value.messages || [];
          const statuses = value.statuses || [];

          console.log(
            "[WA] event",
            JSON.stringify({
              field: change.field || null,
              entryId: entry.id || null,
              phoneNumberId:
                value.metadata?.phone_number_id || null,
              messages: messages.length,
              statuses: statuses.length,
            })
          );

          if (change.field !== "messages") {
            continue;
          }

          for (const message of messages) {
            const from =
              normalizePhone(message.from);

            const expectedRecipient =
              normalizePhone(
                process.env.WHATSAPP_TEST_RECIPIENT
              );

            const accessToken =
              process.env.WHATSAPP_ACCESS_TOKEN;

            const phoneNumberId =
              process.env.WHATSAPP_PHONE_NUMBER_ID;

            console.log(
              "[WA] incoming",
              JSON.stringify({
                type: message.type || null,
                fromLast4: from.slice(-4),
                expectedLast4:
                  expectedRecipient.slice(-4),
                recipientMatches:
                  Boolean(from) &&
                  from === expectedRecipient,
                accessTokenConfigured:
                  Boolean(accessToken),
                phoneNumberIdConfigured:
                  Boolean(phoneNumberId),
                receivedPhoneNumberId:
                  value.metadata?.phone_number_id || null,
                configuredPhoneNumberId:
                  phoneNumberId || null,
              })
            );

            if (
              !from ||
              !expectedRecipient ||
              from !== expectedRecipient
            ) {
              continue;
            }

            if (message.type !== "text") {
              continue;
            }

            if (!accessToken || !phoneNumberId) {
              console.error(
                "[WA] credentials missing"
              );
              continue;
            }

            const response = await fetch(
              `https://graph.facebook.com/v26.0/${phoneNumberId}/messages`,
              {
                method: "POST",

                headers: {
                  Authorization:
                    `Bearer ${accessToken}`,
                  "Content-Type":
                    "application/json",
                },

                body: JSON.stringify({
                  messaging_product: "whatsapp",
                  recipient_type: "individual",
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
                "[WA] send error",
                response.status,
                await response.text()
              );
            } else {
              console.log(
                "[WA] reply sent"
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
        "[WA] webhook error",
        error
      );

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
