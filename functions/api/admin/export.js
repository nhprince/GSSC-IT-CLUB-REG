import { requireAuth, jsonResponse, unauthorized } from "../../_utils/auth.js";

// Same whitelist as the members list endpoint, so the export can honour the
// admin panel's current sort selection. Anything unrecognised falls back to
// the historical default ordering below.
const SORTABLE_COLUMNS = new Set([
  "created_at",
  "full_name",
  "student_id",
  "department",
  "year",
  "session",
  "confirmation_status",
]);

// Real columns pulled from the members table.
const DB_COLUMNS = [
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
  "confirmation_status",
  "confirmed_at",
];

// Final CSV column order — appends the synthetic photo-URL columns (built
// per-row below, not selected from D1 directly) after the real columns.
const CSV_COLUMNS = [...DB_COLUMNS, "profile_photo_url", "id_document_photo_url"];

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
    const origin = new URL(request.url).origin;

    // Optional sort params, mirroring GET /api/admin/members — sorted exports
    // match the table. Absent/invalid params keep the historical default.
    const url = new URL(request.url);
    const sortParam = url.searchParams.get("sort") || "created_at";
    const orderParam = (url.searchParams.get("order") || "desc").toLowerCase();
    const sortCol = SORTABLE_COLUMNS.has(sortParam) ? sortParam : "created_at";
    const order = orderParam === "asc" ? "ASC" : "DESC";

    const { results } = await env.DB.prepare(
      `SELECT ${DB_COLUMNS.join(", ")},
              (profile_photo IS NOT NULL) AS has_profile_photo,
              (id_document_photo IS NOT NULL) AS has_id_document_photo
       FROM members ORDER BY ${sortCol} ${order}`
    ).all();

    const lines = [CSV_COLUMNS.join(",")];
    for (const row of results) {
      const values = CSV_COLUMNS.map((col) => {
        if (col === "interests") {
          try {
            return csvEscape(JSON.parse(row.interests || "[]").join("; "));
          } catch {
            return "";
          }
        }
        if (col === "profile_photo_url") {
          return row.has_profile_photo ? csvEscape(`${origin}/api/admin/members/${row.id}/photo?field=profile_photo`) : "";
        }
        if (col === "id_document_photo_url") {
          return row.has_id_document_photo
            ? csvEscape(`${origin}/api/admin/members/${row.id}/photo?field=id_document_photo`)
            : "";
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
