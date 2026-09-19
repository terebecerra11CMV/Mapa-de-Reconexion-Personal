import { createHash } from "crypto";
import { redis } from "./_redis.js";
import { syncGoogleSheetsEvent } from "./_google-sheets.js";

const MAP_BASE_URL =
  "https://mapa-de-reconexion-personal.vercel.app";

const REAL_PRODUCT_ID = 8258558;

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

function normalizeEmail(email) {
  return (email || "")
    .toString()
    .trim()
    .toLowerCase();
}

function createToken(seed) {
  return (
    "hm-" +
    createHash("sha256")
      .update(seed)
      .digest("hex")
      .slice(0, 28)
  );
}

async function savePurchase(
  purchaseKey,
  record
) {
  await redis.set(
    purchaseKey,
    JSON.stringify(record)
  );
}

async function sendToHotmartSend(record) {
  const sendUrl = (
    process.env.HOTMART_SEND_URL || ""
  ).trim();

  const sendHottok = (
    process.env.HOTMART_SEND_HOTTOK || ""
  ).trim();

  /*
   * Permitimos desplegar el código incluso
   * antes de que Tere termine Vercel.
   */
  if (!sendUrl || !sendHottok) {
    return {
      ok: false,
      configured: false,
      reason: "send_not_configured",
    };
  }

  if (!record.buyerEmail) {
    return {
      ok: false,
      configured: true,
      reason: "missing_email",
    };
  }

  const response = await fetch(
    sendUrl,
    {
      method: "POST",

      headers: {
        "Content-Type":
          "application/json",
      },

      body: JSON.stringify({
        email:
          record.buyerEmail,

        hottok:
          sendHottok,

        first_name:
          record.buyerFirstName ||
          record.buyerName ||
          "",

        last_name:
          record.buyerLastName ||
          "",

        /*
         * ESTE es el enlace individual
         * que luego Hotmart Send inserta
         * como %Subscriber:website%.
         */
        website:
          record.accessUrl,
      }),
    }
  );

  if (!response.ok) {
    const responseText =
      await response.text();

    throw new Error(
      "Hotmart Send HTTP " +
      response.status +
      " " +
      responseText
    );
  }

  return {
    ok: true,
    configured: true,
  };
}

function cartAbandonedAt(creationDate, fallback) {
  if (
    creationDate !== null &&
    creationDate !== undefined &&
    creationDate !== ""
  ) {
    const milliseconds =
      Number(creationDate);

    if (Number.isFinite(milliseconds)) {
      const date = new Date(milliseconds);

      if (!Number.isNaN(date.getTime())) {
        return date.toISOString();
      }
    }
  }

  return fallback;
}

async function handleAbandonedCart(
  body,
  res
) {
  const data = body.data || {};
  const product = data.product || {};
  const buyer = data.buyer || {};
  const offer = data.offer || {};
  const checkoutCountry =
    data.checkout_country || {};

  const productId =
    Number(product.id || 0);

  if (productId !== REAL_PRODUCT_ID) {
    return res.status(200).json({
      ok: true,
      ignored: true,
      reason: "different_product",
      productId
    });
  }

  const eventId = (body.id || "")
    .toString()
    .trim();

  if (!eventId) {
    return res.status(400).json({
      ok: false,
      reason: "missing_event_id"
    });
  }

  const email =
    normalizeEmail(buyer.email);

  const phone = (buyer.phone || "")
    .toString()
    .trim();

  const cartKey =
    `hotmart-cart:${eventId}`;

  try {
    const existingRaw =
      await redis.get(cartKey);

    const existing =
      parseStored(existingRaw);

    const now =
      new Date().toISOString();

    const record = {
      eventId,
      productId,
      productName:
        product.name || null,
      buyerName:
        buyer.name || null,
      buyerEmail:
        email || null,
      buyerPhone:
        phone || null,
      offerCode:
        offer.code || null,
      countryName:
        checkoutCountry.name || null,
      countryIso:
        checkoutCountry.iso || null,
      affiliate:
        data.affiliate || null,
      abandonedAt:
        cartAbandonedAt(
          body.creation_date,
          now
        ),
      createdAt:
        (existing && existing.createdAt) ||
        now,
      googleSheetsSync: null,
      googleSheetsSyncedAt: null
    };

    if (!email && !phone) {
      record.googleSheetsSync = {
        attempted: false,
        ok: false,
        reason: "missing_contact"
      };

      await redis.set(
        cartKey,
        JSON.stringify(record)
      );

      return res.status(200).json({
        ok: true,
        ignored: true,
        reason: "missing_contact"
      });
    }

    await redis.set(
      cartKey,
      JSON.stringify(record)
    );

    let syncResult;

    try {
      syncResult =
        await syncGoogleSheetsEvent({
          event: "cart_abandoned",
          eventId,
          email: email || null,
          fullName:
            record.buyerName,
          phone: phone || null,
          productId,
          productName:
            record.productName,
          offerCode:
            record.offerCode,
          country:
            record.countryIso ||
            record.countryName,
          affiliate:
            record.affiliate,
          abandonedAt:
            record.abandonedAt
        });
    } catch (syncError) {
      console.error(
        "[hotmart-webhook-live] Google Sheets cart sync:",
        syncError
      );

      syncResult = {
        ok: false,
        configured: true,
        reason:
          "google_sheets_unexpected_error"
      };
    }

    record.googleSheetsSync = {
      attempted: true,
      ...syncResult
    };
    record.googleSheetsSyncedAt =
      new Date().toISOString();

    await redis.set(
      cartKey,
      JSON.stringify(record)
    );

    return res.status(200).json({
      ok: true,
      event:
        "cart_abandoned",
      duplicate:
        Boolean(existingRaw),
      sheetsSynced:
        Boolean(syncResult.ok)
    });
  } catch (error) {
    console.error(
      "[hotmart-webhook-live] abandoned cart:",
      error
    );

    return res.status(500).json({
      ok: false,
      reason: "internal_error"
    });
  }
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
      reason: "method_not_allowed",
    });
  }

  /*
   * Por ahora mantenemos la validación
   * mínima que ya probamos con Hotmart.
   */
  const hottokHeader = (
    req.headers["x-hotmart-hottok"] || ""
  )
    .toString()
    .trim();

  if (!hottokHeader) {
    return res.status(401).json({
      ok: false,
      reason: "missing_hotmart_hottok",
    });
  }

  const body = parseBody(req);

  if (
    body.event ===
    "PURCHASE_OUT_OF_SHOPPING_CART"
  ) {
    return handleAbandonedCart(
      body,
      res
    );
  }

  if (
    body.event !== "PURCHASE_APPROVED"
  ) {
    return res.status(200).json({
      ok: true,
      ignored: true,
      event: body.event || null,
    });
  }

  const data =
    body.data || {};

  const purchase =
    data.purchase || {};

  const buyer =
    data.buyer || {};

  const product =
    data.product || {};

  const productId =
    Number(product.id || 0);

  /*
   * Hotmart usa product.id = 0
   * en su payload oficial de prueba.
   */
  const isHotmartTest =
    productId === 0 &&
    product.name ===
      "Produto test postback2";

  if (
    productId !== REAL_PRODUCT_ID &&
    !isHotmartTest
  ) {
    return res.status(200).json({
      ok: true,
      ignored: true,
      reason: "different_product",
      productId,
    });
  }

  if (
    purchase.status &&
    purchase.status !== "APPROVED"
  ) {
    return res.status(200).json({
      ok: true,
      ignored: true,
      reason:
        "purchase_not_approved",
      status:
        purchase.status,
    });
  }

  const transaction = (
    purchase.transaction || ""
  )
    .toString()
    .trim();

  const email =
    normalizeEmail(
      buyer.email
    );

  if (!transaction) {
    return res.status(400).json({
      ok: false,
      reason:
        "missing_transaction",
    });
  }

  if (!email) {
    return res.status(400).json({
      ok: false,
      reason:
        "missing_buyer_email",
    });
  }

  try {
    /*
     * Para compras reales:
     * transacción = token determinístico.
     *
     * Para pruebas:
     * Hotmart reutiliza la transacción,
     * así que usamos body.id para generar
     * una prueba distinta cada vez.
     */
    const seed =
      isHotmartTest
        ? `${transaction}:${body.id || Date.now()}`
        : transaction;

    const purchaseKey =
      isHotmartTest
        ? `hotmart-test-live:${
            body.id ||
            createHash("sha1")
              .update(seed)
              .digest("hex")
          }`
        : `hotmart-purchase:${transaction}`;

    const existingRaw =
      await redis.get(
        purchaseKey
      );

    let record =
      parseStored(
        existingRaw
      );

    /*
     * Generamos el acceso solamente
     * si esta compra no existía.
     */
    if (
      !record ||
      !record.accessUrl
    ) {
      const token =
        createToken(seed);

      const accessUrl =
        `${MAP_BASE_URL}/?token=${encodeURIComponent(
          token
        )}`;

      record = {
        source: "hotmart",
        test: isHotmartTest,

        webhookEventId:
          body.id || null,

        event:
          body.event,

        transaction,

        productId,

        productName:
          product.name || null,

        buyerName:
          buyer.name || null,

        buyerFirstName:
          buyer.first_name || null,

        buyerLastName:
          buyer.last_name || null,

        buyerEmail:
          email,

        buyerPhone:
          buyer.checkout_phone ||
          null,

        buyerPhoneCode:
          buyer.checkout_phone_code ||
          null,

        purchaseStatus:
          purchase.status || null,

        purchaseDate:
          purchase.approved_date ||
          purchase.order_date ||
          null,

        token,
        accessUrl,

        createdAt:
          new Date().toISOString(),

        sendStatus:
          "pending",

        sendDeliveredAt:
          null,

        sendLastError:
          null,

        mapUsed:
          false,

        mapUsedAt:
          null,

        mapFullName:
          null,

        mapBirthDate:
          null,
      };

      await savePurchase(
        purchaseKey,
        record
      );

      /*
       * token -> compra
       */
      await redis.set(
        `mapa-access:${token}`,
        JSON.stringify({
          transaction,
          purchaseKey,
        })
      );
    }

    /*
     * email -> compra.
     * También alimenta acceso.html,
     * nuestro mecanismo de recuperación.
     */
    await redis.set(
      `mapa-buyer:${email}`,
      purchaseKey
    );

    await syncGoogleSheetsEvent({
      event: "purchase_approved",
      transaction:
        record.transaction,
      email:
        record.buyerEmail,
      firstName:
        record.buyerFirstName,
      lastName:
        record.buyerLastName,
      phone:
        record.buyerPhone,
      phoneCode:
        record.buyerPhoneCode,
      purchaseDate:
        record.purchaseDate,
      productId:
        record.productId,
      productName:
        record.productName,
      country:
        (data.checkout_country &&
          (data.checkout_country.iso ||
            data.checkout_country.name)) ||
        null,
      tags:
        "COMPRA APROBADA - MAPA DE RECONEXIÓN PERSONAL"
    });

    /*
     * Entrega automática a Hotmart Send.
     *
     * Si ya se entregó antes,
     * NO mandamos un segundo email.
     */
    if (!record.sendDeliveredAt) {
      try {
        const sendResult =
          await sendToHotmartSend(
            record
          );

        if (
          sendResult.configured &&
          sendResult.ok
        ) {
          record.sendStatus =
            "delivered_to_hotmart_send";

          record.sendDeliveredAt =
            new Date().toISOString();

          record.sendLastError =
            null;
        } else {
          /*
           * Tere aún no puso las variables.
           * No rompemos la compra.
           */
          record.sendStatus =
            sendResult.reason ||
            "pending_configuration";
        }

        await savePurchase(
          purchaseKey,
          record
        );
      } catch (sendError) {
        /*
         * Guardamos el error para soporte.
         */
        record.sendStatus =
          "failed";

        record.sendLastError =
          sendError.message ||
          "unknown_error";

        await savePurchase(
          purchaseKey,
          record
        );

        console.error(
          "[hotmart-webhook-live] Hotmart Send:",
          sendError
        );

        /*
         * Devolvemos error para que una
         * compra real no quede silenciosamente
         * sin intentar entregar nuevamente.
         */
        return res.status(502).json({
          ok: false,
          reason:
            "hotmart_send_failed",
          transaction,
          accessUrl:
            record.accessUrl,
        });
      }
    }

    return res.status(200).json({
      ok: true,

      test:
        isHotmartTest,

      duplicate:
        Boolean(existingRaw),

      transaction,

      token:
        record.token,

      accessUrl:
        record.accessUrl,

      sendStatus:
        record.sendStatus,
    });
  } catch (err) {
    console.error(
      "[hotmart-webhook-live] error:",
      err
    );

    return res.status(500).json({
      ok: false,
      reason: "internal_error",
    });
  }
}
