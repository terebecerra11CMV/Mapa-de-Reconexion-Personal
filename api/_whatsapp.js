import { randomUUID, timingSafeEqual } from "node:crypto";

const value = (env, name) => String(env[name] || "").trim();
const parse = (raw) => typeof raw === "string" ? JSON.parse(raw) : raw;
const metaCode = (raw) => Number.isSafeInteger(raw) ? raw : null;

export function validHotmartToken(received, expected) {
  const a = Buffer.from(String(received || ""));
  const b = Buffer.from(String(expected || ""));
  return b.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}

// Hotmart checkout_phone_code is a Brazilian DDD, NOT a country code.
export function normalizeBuyerPhone(buyer, country = "") {
  const raw = String(buyer.checkout_phone || "").trim();
  if (!raw || !/^\+?[\d().\s-]+$/.test(raw)) return null;
  const digits = raw.replace(/\D/g, "");
  const region = String(country || "").toUpperCase();
  let phone = digits;
  if (raw.startsWith("+")) {
    phone = digits;
  } else if (raw.startsWith("00")) {
    phone = digits.slice(2);
  } else if (region === "BR") {
    const ddd = String(buyer.checkout_phone_code || "").replace(/\D/g, "");
    if (/^\d{8,9}$/.test(phone) && /^\d{2}$/.test(ddd)) phone = ddd + phone;
    if (/^\d{10,11}$/.test(phone)) phone = "55" + phone;
    else if (!/^55\d{10,11}$/.test(phone)) return null;
  } else if (region === "MX" || region === "CO" || region === "US" || region === "CA") {
    const dial = { MX: "52", CO: "57", US: "1", CA: "1" }[region];
    if (/^\d{10}$/.test(phone)) phone = dial + phone;
    else if (!phone.startsWith(dial)) return null;
  } else if (!/^[1-9]\d{10,14}$/.test(phone)) {
    return null; // No country guessing for ambiguous national numbers.
  }
  return /^[1-9]\d{9,14}$/.test(phone) ? phone : null;
}

export function templatePayload(record, phone, env = process.env) {
  const name = String(record.buyerFirstName || record.buyerName || "cliente")
    .replace(/\s+/g, " ").trim().slice(0, 100) || "cliente";
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: phone,
    type: "template",
    template: {
      name: value(env, "WHATSAPP_TEMPLATE_NAME"),
      language: { code: value(env, "WHATSAPP_TEMPLATE_LANGUAGE") },
      components: [
        { type: "body", parameters: [{ type: "text", text: name }] },
        { type: "button", sub_type: "url", index: "0",
          parameters: [{ type: "text", text: record.token }] }
      ]
    }
  };
}

// One atomic state per transaction; no purchase-record overwrites.
// A crashed/uncertain HTTP attempt is never automatically resent.
const CLAIM = `
local old = redis.call('GET', KEYS[1])
if old then
  local state = cjson.decode(old)
  if state.status ~= 'retryable' then return old end
end
redis.call('SET', KEYS[1], ARGV[1])
return 'CLAIMED'
`;
const FINISH = `
local old = redis.call('GET', KEYS[1])
if not old then return 0 end
local state = cjson.decode(old)
if state.attemptId ~= ARGV[1] or state.status ~= 'sending' then return 0 end
redis.call('SET', KEYS[1], ARGV[2])
return 1
`;
const RECORD_SKIP = `
local old = redis.call('GET', KEYS[1])
if old then return old end
redis.call('SET', KEYS[1], ARGV[1])
return 'RECORDED'
`;

async function recordSkipped(redis, stateKey, result) {
  const saved = await redis.eval(RECORD_SKIP, [stateKey], [JSON.stringify({
    ...result,
    completedAt: new Date().toISOString()
  })]);
  if (saved === "RECORDED") return result;

  const previous = parse(saved);
  if (!previous || typeof previous.status !== "string") {
    throw new Error("invalid_whatsapp_state");
  }
  return {
    status: previous.status === "sending" ? "pending_or_unknown" : previous.status,
    retry: false,
    messageId: previous.messageId || null,
    duplicate: true
  };
}

export async function deliverWhatsApp(record, purchaseKey, {
  redis, buyer = {}, country = "", env = process.env,
  fetchImpl = fetch, timeoutMs = 8000, eligible = true
}) {
  const stateKey = "whatsapp-delivery:" + purchaseKey;
  const skip = (status, reason) => recordSkipped(redis, stateKey, {
    status, retry: false, ...(reason ? { reason } : {})
  });

  if (value(env, "WHATSAPP_ENABLED") !== "true") return skip("disabled");
  if (!eligible) return skip("historical_skipped", "created_before_whatsapp_activation");
  const required = ["WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID",
    "WHATSAPP_TEMPLATE_NAME", "WHATSAPP_TEMPLATE_LANGUAGE",
    "WHATSAPP_GRAPH_API_VERSION", "HOTMART_WEBHOOK_HOTTOK"];
  if (required.some(name => !value(env, name))) return skip("not_configured");
  if (!/^v\d+\.\d+$/.test(value(env, "WHATSAPP_GRAPH_API_VERSION")) ||
      !/^\d+$/.test(value(env, "WHATSAPP_PHONE_NUMBER_ID"))) {
    return skip("invalid_configuration");
  }

  // The official Hotmart test must never message the test payload's buyer.
  let phone;
  if (record.test) {
    const recipient = value(env, "WHATSAPP_TEST_RECIPIENT");
    if (!recipient) return skip("test_skipped", "missing_controlled_recipient");
    phone = normalizeBuyerPhone({ checkout_phone: "+" + recipient.replace(/^\+/, "") });
  } else {
    phone = normalizeBuyerPhone(buyer, country);
  }
  if (!phone) return skip("missing_or_invalid_phone");
  if (!record.token || !record.accessUrl) return skip("missing_access");

  const attemptId = randomUUID();
  const started = { status: "sending", attemptId, startedAt: new Date().toISOString() };
  const claimed = await redis.eval(CLAIM, [stateKey], [JSON.stringify(started)]);
  if (claimed !== "CLAIMED") {
    const previous = parse(claimed);
    // No messageId means receipt was not confirmed. This is not delivery.
    return { status: previous.status === "sending" ? "pending_or_unknown" : previous.status,
      retry: false, messageId: previous.messageId || null, duplicate: true };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let result;
  try {
    const version = value(env, "WHATSAPP_GRAPH_API_VERSION");
    const id = value(env, "WHATSAPP_PHONE_NUMBER_ID");
    const response = await fetchImpl(`https://graph.facebook.com/${version}/${id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json",
        Authorization: "Bearer " + value(env, "WHATSAPP_ACCESS_TOKEN") },
      body: JSON.stringify(templatePayload(record, phone, env)),
      signal: controller.signal
    });
    let data = null;
    try { data = await response.json(); } catch { /* Do not log raw responses. */ }
    const messageId = typeof data?.messages?.[0]?.id === "string"
      ? data.messages[0].id.slice(0, 512) : null;
    if (response.ok && messageId) {
      result = { status: "accepted", retry: false, messageId };
    } else if (response.status === 429) {
      result = { status: "retryable", retry: true, httpStatus: 429,
        errorCode: metaCode(data?.error?.code) };
    } else if (!response.ok && response.status >= 400 && response.status < 500) {
      result = { status: "failed", retry: false, httpStatus: response.status,
        errorCode: metaCode(data?.error?.code),
        errorSubcode: metaCode(data?.error?.error_subcode) };
    } else {
      result = { status: "unknown", retry: false, httpStatus: response.status };
    }
  } catch {
    result = { status: "unknown", retry: false, reason: "network_or_timeout" };
  } finally {
    clearTimeout(timer);
  }
  const saved = await redis.eval(FINISH, [stateKey], [attemptId, JSON.stringify({
    ...started, ...result, completedAt: new Date().toISOString()
  })]);
  if (Number(saved) !== 1) throw new Error("whatsapp_state_not_saved");
  return result;
}
