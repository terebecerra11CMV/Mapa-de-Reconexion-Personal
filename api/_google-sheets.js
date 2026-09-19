const GOOGLE_SHEETS_TIMEOUT_MS = 5000;

export async function syncGoogleSheetsEvent(payload) {
  const syncUrl = (
    process.env.GOOGLE_SHEETS_SYNC_URL || ""
  ).trim();

  const syncSecret = (
    process.env.GOOGLE_SHEETS_SYNC_SECRET || ""
  ).trim();

  if (!syncUrl || !syncSecret) {
    return {
      ok: false,
      configured: false,
      reason: "google_sheets_not_configured"
    };
  }

  let timeoutId = null;

  try {
    const controller = new AbortController();

    timeoutId = setTimeout(
      () => controller.abort(),
      GOOGLE_SHEETS_TIMEOUT_MS
    );

    const response = await fetch(
      syncUrl,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          ...payload,
          secret: syncSecret
        }),
        signal: controller.signal
      }
    );

    if (!response.ok) {
      console.error(
        "[google-sheets] HTTP error:",
        response.status
      );

      return {
        ok: false,
        configured: true,
        reason: "google_sheets_http_error"
      };
    }

    let responseData;

    try {
      responseData = await response.json();
    } catch (error) {
      console.error(
        "[google-sheets] invalid response:",
        error
      );

      return {
        ok: false,
        configured: true,
        reason: "google_sheets_invalid_response"
      };
    }

    if (!responseData || responseData.ok !== true) {
      console.error(
        "[google-sheets] application error:",
        responseData && responseData.reason
          ? responseData.reason
          : "unknown_error"
      );

      return {
        ok: false,
        configured: true,
        reason: "google_sheets_application_error"
      };
    }

    return {
      ok: true,
      configured: true,
      reason: null
    };
  } catch (error) {
    const timedOut =
      error && error.name === "AbortError";

    console.error(
      "[google-sheets] sync error:",
      error
    );

    return {
      ok: false,
      configured: true,
      reason: timedOut
        ? "google_sheets_timeout"
        : "google_sheets_request_failed"
    };
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}
