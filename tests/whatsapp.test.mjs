import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { deliverWhatsApp, normalizeBuyerPhone, templatePayload, validHotmartToken } from "../api/_whatsapp.js";

const env = {
  WHATSAPP_ENABLED: "true", WHATSAPP_ACCESS_TOKEN: "fixture-not-a-secret",
  WHATSAPP_PHONE_NUMBER_ID: "1252348971306240", WHATSAPP_TEMPLATE_NAME: "entrega_mapa_reconexion",
  WHATSAPP_TEMPLATE_LANGUAGE: "es_MX", WHATSAPP_GRAPH_API_VERSION: "v25.0",
  HOTMART_WEBHOOK_HOTTOK: "fixture-hottok"
};
const record = { buyerFirstName: "María", token: "hm-fixture", accessUrl: "https://mapa-de-reconexion-personal.vercel.app/?token=hm-fixture" };
const buyer = { checkout_phone: "+57 300 123 4567" };
function storage() {
  const values = new Map();
  return { values,
    async get(k) { return values.get(k) ?? null; },
    async set(k, v) { values.set(k, v); return "OK"; },
    async eval(script, [key], args) {
      const old = values.get(key);
      if (script.includes("return 'RECORDED'")) {
        if (old) return old;
        values.set(key, args[0]); return "RECORDED";
      }
      if (args.length === 1) {
        if (old && JSON.parse(old).status !== "retryable") return old;
        values.set(key, args[0]); return "CLAIMED";
      }
      if (!old || JSON.parse(old).attemptId !== args[0] || JSON.parse(old).status !== "sending") return 0;
      values.set(key, args[1]); return 1;
    }
  };
}
const reply = (status, data) => ({ ok: status >= 200 && status < 300, status, json: async () => data });
const accepted = () => reply(200, { messages: [{ id: "wamid.fixture" }] });

test("Hotmart phone normalization: MX, CO, Brazil DDD, international, ambiguous", () => {
  assert.equal(normalizeBuyerPhone({ checkout_phone: "8701677060", checkout_phone_code: "52" }, "MX"), "528701677060");
  assert.equal(normalizeBuyerPhone({ checkout_phone: "3001234567" }, "CO"), "573001234567");
  assert.equal(normalizeBuyerPhone({ checkout_phone: "999999999", checkout_phone_code: "11" }, "BR"), "5511999999999");
  assert.equal(normalizeBuyerPhone({ checkout_phone: "5511999999999" }, "BR"), "5511999999999");
  assert.equal(normalizeBuyerPhone(buyer), "573001234567");
  assert.equal(normalizeBuyerPhone({ checkout_phone: "0034612345678" }), "34612345678");
  assert.equal(normalizeBuyerPhone({ checkout_phone: "3001234567" }), null);
  assert.equal(normalizeBuyerPhone({ checkout_phone: "n/a" }), null);
  assert.equal(normalizeBuyerPhone({ checkout_phone: "+00000" }), null);
  assert.equal(normalizeBuyerPhone({ checkout_phone: "57+3001234567" }), null);
});
test("exact template body and dynamic suffix (not full URL)", () => {
  const payload = templatePayload(record, "573001234567", env);
  assert.equal(payload.template.name, "entrega_mapa_reconexion");
  assert.equal(payload.template.language.code, "es_MX");
  assert.deepEqual(payload.template.components, [
    { type: "body", parameters: [{ type: "text", text: "María" }] },
    { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: "hm-fixture" }] }
  ]);
});
test("Hottok requires an exact nonempty match", () => {
  assert.equal(validHotmartToken("fixture-hottok", env.HOTMART_WEBHOOK_HOTTOK), true);
  assert.equal(validHotmartToken("wrong", env.HOTMART_WEBHOOK_HOTTOK), false);
  assert.equal(validHotmartToken("", ""), false);
});
test("disabled, incomplete config and missing phone never call Meta", async () => {
  const fetchImpl = () => { throw new Error("must not fetch"); };
  let index = 0;
  for (const [e, b, status] of [
    [{ ...env, WHATSAPP_ENABLED: "false" }, buyer, "disabled"],
    [{ ...env, HOTMART_WEBHOOK_HOTTOK: "" }, buyer, "not_configured"],
    [env, {}, "missing_or_invalid_phone"]
  ]) {
    const redis = storage();
    const key = "purchase-" + index++;
    assert.equal((await deliverWhatsApp(record, key, { redis, buyer: b, env: e, fetchImpl })).status, status);
    assert.equal(JSON.parse(redis.values.get("whatsapp-delivery:" + key)).status, status);
  }
});
test("historical purchases are recorded as skipped and never sent", async () => {
  const redis = storage();
  const fetchImpl = () => { throw new Error("must not fetch"); };
  const first = await deliverWhatsApp(record, "historical", {
    redis, buyer, env, fetchImpl, eligible: false
  });
  assert.equal(first.status, "historical_skipped");
  assert.equal((await deliverWhatsApp(record, "historical", {
    redis, buyer, env, fetchImpl
  })).status, "historical_skipped");
});
test("accepted send stores wamid; sequential duplicates do not resend", async () => {
  let calls = 0;
  const redis = storage();
  const fetchImpl = async (url, opts) => {
    calls++; assert.equal(url, "https://graph.facebook.com/v25.0/1252348971306240/messages");
    assert.equal(JSON.parse(opts.body).template.components[1].parameters[0].text, "hm-fixture");
    return accepted();
  };
  const opts = { redis, buyer, env, fetchImpl };
  assert.equal((await deliverWhatsApp(record, "purchase", opts)).status, "accepted");
  assert.equal((await deliverWhatsApp(record, "purchase", opts)).duplicate, true);
  assert.equal(calls, 1);
});
test("concurrent webhook deliveries claim only one send", async () => {
  let calls = 0;
  const opts = { redis: storage(), buyer, env, fetchImpl: async () => { calls++; return accepted(); } };
  await Promise.all(Array.from({ length: 20 }, () => deliverWhatsApp(record, "same-purchase", opts)));
  assert.equal(calls, 1);
});
test("network uncertainty is recorded and never blindly resent", async () => {
  let calls = 0;
  const opts = { redis: storage(), buyer, env, fetchImpl: async () => { calls++; throw new Error("timeout with secret and PII"); } };
  const result = await deliverWhatsApp(record, "purchase", opts);
  assert.equal(result.status, "unknown");
  assert.equal(JSON.stringify(result).includes("secret"), false);
  await deliverWhatsApp(record, "purchase", opts);
  assert.equal(calls, 1);
});
test("explicit Meta rate limit can be retried and then deduplicated", async () => {
  let calls = 0;
  const opts = { redis: storage(), buyer, env, fetchImpl: async () => ++calls === 1 ? reply(429, { error: { code: 130429 } }) : accepted() };
  assert.equal((await deliverWhatsApp(record, "purchase", opts)).retry, true);
  assert.equal((await deliverWhatsApp(record, "purchase", opts)).status, "accepted");
  await deliverWhatsApp(record, "purchase", opts);
  assert.equal(calls, 2);
});
test("Meta rejection, missing wamid and 5xx are not reported as delivered", async () => {
  for (const [response, status] of [
    [reply(400, { error: { code: 132000, message: "contains untrusted data" } }), "failed"],
    [reply(403, {}), "failed"],
    [reply(200, {}), "unknown"],
    [reply(503, {}), "unknown"]
  ]) assert.equal((await deliverWhatsApp(record, "purchase", { redis: storage(), buyer, env, fetchImpl: async () => response })).status, status);
});
test("official Hotmart tests require an explicit controlled recipient", async () => {
  const opts = { redis: storage(), buyer, env, fetchImpl: () => { throw Error("must not send"); } };
  assert.equal((await deliverWhatsApp({ ...record, test: true }, "test", opts)).status, "test_skipped");
  opts.env = { ...env, WHATSAPP_TEST_RECIPIENT: "+573001234567" };
  opts.fetchImpl = async (_url, req) => { assert.equal(JSON.parse(req.body).to, "573001234567"); return accepted(); };
  assert.equal((await deliverWhatsApp({ ...record, test: true }, "controlled-test", opts)).status, "accepted");
});

test("webhook: preserve email/access, send WhatsApp once, isolate Meta failures and reject wrong Hottok", async () => {
  const redis = storage();
  globalThis.__tereTestRedis = redis;
  const helperUrl = new URL("../api/_whatsapp.js", import.meta.url).href;
  let source = await readFile(new URL("../api/hotmart-webhook-live.js", import.meta.url), "utf8");
  source = source.replace('"./_redis.js"', '"data:text/javascript,export const redis = globalThis.__tereTestRedis"')
    .replace('"./_google-sheets.js"', '"data:text/javascript,export async function syncGoogleSheetsEvent() { return { ok: true }; }"')
    .replace('"./_whatsapp.js"', JSON.stringify(helperUrl));
  const handler = (await import("data:text/javascript;base64," + Buffer.from(source).toString("base64"))).default;
  const previousEnv = { ...process.env }, previousFetch = globalThis.fetch;
  const previousConsoleError = console.error;
  let emails = 0, whatsapps = 0, emailFails = false, metaFails = false;
  Object.assign(process.env, env, { HOTMART_SEND_URL: "https://send.example.invalid", HOTMART_SEND_HOTTOK: "send-fixture" });
  globalThis.fetch = async (url) => {
    if (url === "https://send.example.invalid") {
      emails++; return { ok: !emailFails, status: 503, text: async () => "fixture failure" };
    }
    whatsapps++; return metaFails ? reply(400, { error: { code: 132000 } }) : accepted();
  };
  const call = async (transaction, token = "fixture-hottok", options = {}) => {
    const req = { method: "POST", headers: { "x-hotmart-hottok": token }, body: {
      id: options.omitEventId ? undefined : "event-" + transaction,
      event: options.event || "PURCHASE_APPROVED", data: {
        product: options.officialTest
          ? { id: 0, name: "Produto test postback2" }
          : { id: options.productId ?? 8258558 },
        purchase: { transaction, status: options.purchaseStatus || "APPROVED" },
        buyer: { ...buyer, email: "fixture@example.invalid", first_name: "María" }, checkout_country: { iso: "CO" }
      }
    } };
    const res = { setHeader() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
    await handler(req, res); return res;
  };
  try {
    assert.equal((await call("missing-id", "fixture-hottok", {
      officialTest: true, omitEventId: true
    })).code, 400);
    assert.equal((await call("pending", "fixture-hottok", {
      purchaseStatus: "PENDING"
    })).body.reason, "purchase_not_approved");
    assert.equal((await call("other-product", "fixture-hottok", {
      productId: 123
    })).body.reason, "different_product");
    assert.equal(emails, 0); assert.equal(whatsapps, 0);
    const first = await call("one");
    assert.equal(first.code, 200); assert.equal(first.body.whatsappStatus, "accepted");
    const again = await call("one");
    assert.equal(first.body.token, again.body.token); assert.equal(first.body.accessUrl, again.body.accessUrl);
    assert.equal(emails, 1); assert.equal(whatsapps, 1);
    assert.ok(redis.values.has("mapa-access:" + first.body.token));
    assert.equal(JSON.parse(redis.values.get("hotmart-purchase:one")).whatsappStatus, undefined);
    assert.ok(redis.values.has("whatsapp-delivery:hotmart-purchase:one"));
    assert.equal((await call("wrong", "bad-token")).code, 401);
    assert.equal(whatsapps, 1);
    redis.values.set("hotmart-purchase:legacy", JSON.stringify({
      token: "hm-legacy", accessUrl: "https://mapa-de-reconexion-personal.vercel.app/?token=hm-legacy",
      transaction: "legacy", buyerEmail: "fixture@example.invalid", sendDeliveredAt: "2026-01-01T00:00:00.000Z",
      sendStatus: "delivered_to_hotmart_send"
    }));
    const legacy = await call("legacy");
    assert.equal(legacy.body.whatsappStatus, "historical_skipped");
    assert.equal(whatsapps, 1);
    metaFails = true;
    const metaRejected = await call("two");
    assert.equal(metaRejected.code, 200); assert.equal(metaRejected.body.sendStatus, "delivered_to_hotmart_send");
    assert.equal(metaRejected.body.whatsappStatus, "failed");
    metaFails = false; emailFails = true;
    console.error = () => {}; // The next fixture deliberately rejects email.
    const emailRejected = await call("three");
    assert.equal(emailRejected.code, 502); assert.equal(emailRejected.body.whatsappStatus, "accepted");
    const beforeRetry = whatsapps;
    emailFails = false;
    assert.equal((await call("three")).code, 200); assert.equal(whatsapps, beforeRetry);
  } finally {
    console.error = previousConsoleError;
    globalThis.fetch = previousFetch;
    for (const name of Object.keys(process.env)) if (!(name in previousEnv)) delete process.env[name];
    Object.assign(process.env, previousEnv); delete globalThis.__tereTestRedis;
  }
});
