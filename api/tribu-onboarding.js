import { redis } from "./_redis.js";

const TRIBU_URL =
  "https://chat.whatsapp.com/Ii2vVa48CINBfiyxS4KL7r";

const VALID_SCHEDULES = [
  "09:00_CDMX",
  "20:00_CDMX",
];

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

function clean(value, max = 500) {
  return (value || "")
    .toString()
    .trim()
    .slice(0, max);
}

function normalizeEmail(email) {
  return clean(email, 200)
    .toLowerCase();
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

  let body = req.body;

  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }

  const fullName =
    clean(
      body && body.fullName,
      180
    );

  const email =
    normalizeEmail(
      body && body.email
    );

  const whatsapp =
    clean(
      body && body.whatsapp,
      60
    );

  const country =
    clean(
      body && body.country,
      120
    );

  const purchaseDate =
    clean(
      body && body.purchaseDate,
      30
    );

  const expectation =
    clean(
      body && body.expectation,
      1200
    );

  const liveSchedule =
    clean(
      body && body.liveSchedule,
      80
    );

  const acceptedAgreements =
    Boolean(
      body &&
      body.acceptedAgreements
    );

  const acceptedData =
    Boolean(
      body &&
      body.acceptedData
    );

  if (
    !email ||
    !email.includes("@")
  ) {
    return res.status(400).json({
      ok: false,
      reason: "invalid_email",
    });
  }

  if (
    !fullName ||
    !whatsapp ||
    !country ||
    !purchaseDate ||
    !expectation ||
    !liveSchedule
  ) {
    return res.status(400).json({
      ok: false,
      reason: "missing_fields",
    });
  }

  if (
    !VALID_SCHEDULES.includes(
      liveSchedule
    )
  ) {
    return res.status(400).json({
      ok: false,
      reason: "invalid_schedule",
    });
  }

  if (
    !acceptedAgreements ||
    !acceptedData
  ) {
    return res.status(400).json({
      ok: false,
      reason:
        "agreements_required",
    });
  }

  try {
    /*
     * Solo puede avanzar quien
     * tenga una compra aprobada
     * registrada por nuestro webhook.
     */
    const purchaseKeyRaw =
      await redis.get(
        `mapa-buyer:${email}`
      );

    if (!purchaseKeyRaw) {
      return res.status(404).json({
        ok: false,
        reason:
          "purchase_not_found",
      });
    }

    const purchaseKey =
      typeof purchaseKeyRaw ===
      "string"
        ? purchaseKeyRaw
        : purchaseKeyRaw.toString();

    const purchaseRaw =
      await redis.get(
        purchaseKey
      );

    const purchase =
      parseStored(
        purchaseRaw
      );

    if (!purchase) {
      return res.status(404).json({
        ok: false,
        reason:
          "purchase_not_found",
      });
    }

    const submittedAt =
      new Date().toISOString();

    const onboarding = {
      fullName,
      email,
      whatsapp,
      country,

      /*
       * Fecha indicada por
       * la propia compradora.
       */
      purchaseDate,

      expectation,
      liveSchedule,

      acceptedAgreements,
      acceptedData,

      submittedAt,

      transaction:
        purchase.transaction ||
        null,

      source:
        "tribu_onboarding",
    };

    /*
     * Registro independiente
     * por correo.
     */
    await redis.set(
      `tribu-onboarding:${email}`,
      JSON.stringify(
        onboarding
      )
    );

    /*
     * También lo dejamos dentro
     * del registro de compra.
     */
    purchase.tribuOnboarding =
      onboarding;

    purchase.tribuOnboardingAt =
      submittedAt;

    await redis.set(
      purchaseKey,
      JSON.stringify(
        purchase
      )
    );

    return res.status(200).json({
      ok: true,
      tribeUrl:
        TRIBU_URL,
    });

  } catch (error) {
    console.error(
      "[tribu-onboarding] error:",
      error
    );

    return res.status(500).json({
      ok: false,
      reason:
        "internal_error",
    });
  }
}
