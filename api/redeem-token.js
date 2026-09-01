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

function splitFullName(fullName) {
  const parts = (fullName || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!parts.length) {
    return {
      firstName: "",
      lastName: ""
    };
  }

  if (parts.length === 1) {
    return {
      firstName: parts[0],
      lastName: ""
    };
  }

  /*
   * No podemos conocer con 100% de certeza
   * dónde terminan los nombres y empiezan
   * los apellidos.
   *
   * Para Send usamos:
   * primera palabra = nombre
   * resto = apellido(s)
   *
   * El nombre COMPLETO original se sigue
   * guardando íntegro en Redis.
   */
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" ")
  };
}

async function syncCompletedDataToHotmartSend({
  email,
  fullName,
  birthDate,
  accessUrl
}) {
  const sendUrl = (
    process.env.HOTMART_SEND_PROFILE_URL || ""
  ).trim();

  const sendHottok = (
    process.env.HOTMART_SEND_PROFILE_HOTTOK || ""
  ).trim();

  if (!sendUrl || !sendHottok) {
    return {
      ok: false,
      configured: false,
      reason: "profile_send_not_configured"
    };
  }

  if (!email) {
    return {
      ok: false,
      configured: true,
      reason: "missing_email"
    };
  }

  const {
    firstName,
    lastName
  } = splitFullName(fullName);

  const response = await fetch(
    sendUrl,
    {
      method: "POST",

      headers: {
        "Content-Type":
          "application/json"
      },

      body: JSON.stringify({
        email,
        hottok: sendHottok,

        first_name:
          firstName,

        last_name:
          lastName,

        /*
         * Hotmart Send utiliza Birthday /
         * Fecha de nacimiento como campo
         * estándar del contacto.
         */
        birthday:
          birthDate || "",

        /*
         * Conservamos también el link
         * individual del Mapa.
         */
        website:
          accessUrl || ""
      })
    }
  );

  if (!response.ok) {
    const responseText =
      await response.text();

    throw new Error(
      "Hotmart Send profile HTTP " +
      response.status +
      " " +
      responseText
    );
  }

  return {
    ok: true,
    configured: true
  };
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
     * Validamos tokens emitidos por Hotmart.
     */
    if (token.startsWith("hm-")) {
      const accessRaw =
        await redis.get(
          `mapa-access:${token}`
        );

      access =
        parseStored(accessRaw);

      if (
        !access ||
        !access.purchaseKey
      ) {
        return res.status(403).json({
          ok: false,
          reason: "invalid_token"
        });
      }

      const purchaseRaw =
        await redis.get(
          access.purchaseKey
        );

      purchase =
        parseStored(purchaseRaw);

      if (!purchase) {
        return res.status(403).json({
          ok: false,
          reason: "invalid_purchase"
        });
      }

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
     * Candado de un solo uso.
     */
    const claimed =
      await redis.setnx(
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
     * Compatibilidad con la llave anterior.
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
     * Actualizamos compra + sincronizamos
     * datos completados con Hotmart Send.
     */
    if (
      access &&
      access.purchaseKey &&
      purchase
    ) {
      purchase.mapUsed = true;

      purchase.mapUsedAt =
        usedAt;

      purchase.mapFullName =
        fullName || null;

      purchase.mapBirthDate =
        birthDate || null;

      purchase.mapProfileSyncStatus =
        "pending";

      purchase.mapProfileSyncedAt =
        null;

      purchase.mapProfileSyncError =
        null;

      /*
       * Primero persistimos Redis.
       * La generación del Mapa NO depende
       * de que Hotmart Send responda bien.
       */
      await redis.set(
        access.purchaseKey,
        JSON.stringify(purchase)
      );

      try {
        const syncResult =
          await syncCompletedDataToHotmartSend({
            email:
              purchase.buyerEmail,

            fullName,

            birthDate,

            accessUrl:
              purchase.accessUrl
          });

        if (
          syncResult.configured &&
          syncResult.ok
        ) {
          purchase.mapProfileSyncStatus =
            "synced_to_hotmart_send";

          purchase.mapProfileSyncedAt =
            new Date().toISOString();

          purchase.mapProfileSyncError =
            null;
        } else {
          purchase.mapProfileSyncStatus =
            syncResult.reason ||
            "pending_configuration";
        }
      } catch (syncError) {
        /*
         * IMPORTANTE:
         * si Send falla, NO rompemos
         * el Mapa de la clienta.
         */
        purchase.mapProfileSyncStatus =
          "failed";

        purchase.mapProfileSyncError =
          syncError.message ||
          "unknown_error";

        console.error(
          "[redeem-token] Hotmart Send profile sync:",
          syncError
        );
      }

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
