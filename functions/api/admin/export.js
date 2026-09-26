import { requireAuth, jsonResponse, unauthorized } from "../../_utils/auth.js";

const COLUMNS = [
  "id",
  "full_name",
  "student_id",
  "department",
  "year",
  "session",
  "email",
  "phone",
  "date_of_birth",
  "blood_group",
  "present_address",
  "permanent_address",
  "guardian_name",
  "guardian_phone",
  "previous_experience",
  "reason_to_join",
  "interests",
  "social_link",
  "created_at",
];

function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!(await requireAuth(request, env))) return unauthorized();

  try {
    const { results } = await env.DB.prepare(
      `SELECT ${COLUMNS.join(", ")} FROM members ORDER BY created_at DESC`
    ).all();

    const lines = [COLUMNS.join(",")];
    for (const row of results) {
      const values = COLUMNS.map((col) => {
        if (col === "interests") {
          try {
            return csvEscape(JSON.parse(row.interests || "[]").join("; "));
          } catch {
            return "";
          }
        }
        return csvEscape(row[col]);
      });
      lines.push(values.join(","));
    }

    const csv = lines.join("\n");
    const date = new Date().toISOString().slice(0, 10);

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="gssc-it-club-members-${date}.csv"`,
      },
    });
  } catch (err) {
    return jsonResponse({ error: "Failed to export data." }, { status: 500 });
  }
}
