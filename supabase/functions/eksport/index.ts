import * as XLSX from "https://esm.sh/xlsx@0.18.5";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function svar(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  // Manuel JWT-verifikation (verify_jwt=false, saa CORS-preflight virker)
  const auth = req.headers.get("Authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return svar(401, { error: "unauthorized" });

  const who = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: ANON },
  });
  if (!who.ok) return svar(401, { error: "unauthorized" });

  // SIKKERHEDSRETTELSE: her manglede et ADMIN-tjek. Funktionen bruger service_role
  // til at laese ALLE kunder og ALLE medarbejderes timeloen udenom RLS, men
  // kontrollerede kun at kalderen var logget ind. Enhver medarbejder kunne
  // dermed eksportere hele kundedatabasen og kollegernes loen.
  const adm = await fetch(`${SUPABASE_URL}/rest/v1/rpc/er_admin`, {
    method: "POST",
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  const erAdmin = adm.ok ? (await adm.json()) === true : false;
  if (!erAdmin) return svar(403, { error: "Kun administrator kan eksportere data." });

  const type = new URL(req.url).searchParams.get("type") || "crm";
  const q = async (path: string) => {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    });
    return r.ok ? await r.json() : [];
  };

  let rows: any[] = [];
  let sheet = "Data";
  let filename = "casa-food.xlsx";

  if (type === "medarbejdere") {
    const staff = await q(
      "staff?select=name,phone,hourly_rate,active,onboarding_status&order=name",
    );
    rows = staff.map((s: any) => ({
      Navn: s.name,
      Telefon: s.phone,
      "Timel\u00f8n": s.hourly_rate,
      Aktiv: s.active ? "Ja" : "Nej",
      Status: s.onboarding_status,
    }));
    sheet = "Medarbejdere";
    filename = "casa-food-medarbejdere.xlsx";
  } else {
    const cust = await q(
      "customers?select=name,company,email,phone,type,total_bookings,loyalty_flag&order=name",
    );
    rows = cust.map((c: any) => ({
      Navn: c.name,
      Firma: c.company,
      Email: c.email,
      Telefon: c.phone,
      Type: c.type,
      Bookinger: c.total_bookings,
      Loyalitet: c.loyalty_flag ? "Ja" : "Nej",
    }));
    sheet = "Kunder";
    filename = "casa-food-crm.xlsx";
  }

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheet);
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return new Response(buf, {
    headers: {
      ...cors,
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
});
