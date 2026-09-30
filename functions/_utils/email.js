const SENDER = "GSSC IT Club <gsscitclub@stuckstudio.com>";
const SUBJECT = "Your GSSC IT Club Application Has Been Received";
const LOGO_URL = "https://gssc-it-club-reg.stuckstudio.com/assets/logo.png";

const RESEND_SEND_URL = "https://api.resend.com/emails";
const RESEND_BATCH_URL = "https://api.resend.com/emails/batch";

export function buildEmailText(fullName) {
  return `Dear ${fullName},

Thank you for applying to join GSSC IT Club.

We're pleased to confirm that your application has been successfully received. Our team will review your application, and further updates regarding the selection process will be shared soon.

Thank you for your interest in the GSSC IT Club.

Best regards,
GSSC IT Club
Govt. Shaheed Suhrawardy College`;
}

export function buildEmailHtml(fullName) {
  const safeName = escapeHtml(fullName);
  return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#faf7f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf7f5;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" style="max-width:480px;background:#ffffff;border-radius:16px;overflow:hidden;">
            <tr>
              <td style="background:#7f0206;padding:28px 32px;text-align:center;">
                <img src="${LOGO_URL}" width="48" height="48" alt="GSSC IT Club" style="display:block;margin:0 auto 10px;border:0;" />
                <span style="color:#ffffff;font-weight:700;font-size:16px;">GSSC IT Club</span>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;color:#241b1a;font-size:15px;line-height:1.7;">
                <p style="margin:0 0 16px;">Dear ${safeName},</p>
                <p style="margin:0 0 16px;">Thank you for applying to join GSSC IT Club.</p>
                <p style="margin:0 0 16px;">We're pleased to confirm that your application has been successfully received. Our team will review your application, and further updates regarding the selection process will be shared soon.</p>
                <p style="margin:0 0 16px;">Thank you for your interest in the GSSC IT Club.</p>
                <p style="margin:0;">Best regards,<br />GSSC IT Club<br />Govt. Shaheed Suhrawardy College</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function emailPayload(to, fullName) {
  return {
    from: SENDER,
    to: [to],
    subject: SUBJECT,
    text: buildEmailText(fullName),
    html: buildEmailHtml(fullName),
  };
}

function ensureConfigured(env) {
  if (!env.RESEND_API_KEY) {
    const err = new Error(
      "Email sending isn't configured yet. See README.md — \"Setting up confirmation emails\"."
    );
    err.code = "NOT_CONFIGURED";
    throw err;
  }
}

function describeResendError(status, data) {
  const message = (data && (data.message || data.name)) || "";
  if (status === 401 || status === 403) return "Resend rejected the API key. Check the RESEND_API_KEY secret.";
  if (status === 429) return "Resend's daily or rate limit was hit. Try the rest again later or tomorrow.";
  if (status === 400 || status === 422) {
    return message ? `Resend rejected the request: ${message}` : "Resend rejected the request.";
  }
  return message ? `Failed to send email: ${message}` : "Failed to send email. Please try again.";
}

// Sends a single confirmation email. Throws on failure; err.status carries
// the upstream HTTP status when available (429 = rate/daily limit).
export async function sendConfirmationEmail(env, { to, fullName }) {
  ensureConfigured(env);

  const res = await fetch(RESEND_SEND_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(emailPayload(to, fullName)),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(describeResendError(res.status, data));
    err.status = res.status;
    throw err;
  }
  return data; // { id }
}

// Sends up to 100 confirmation emails in a single Resend batch call.
// Throws on failure (the whole chunk failed); err.status as above.
export async function sendConfirmationEmailsBatch(env, recipients) {
  ensureConfigured(env);

  const res = await fetch(RESEND_BATCH_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(recipients.map((r) => emailPayload(r.to, r.fullName))),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(describeResendError(res.status, data));
    err.status = res.status;
    throw err;
  }
  return data.data; // [{ id }, ...] in request order
}
