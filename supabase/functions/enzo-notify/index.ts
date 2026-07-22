import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// enzo-notify — draener email-koeen og sender via Resend.
// Erstatter n8n-workflowet "Enzo - Email Sender" (cron-polling hvert 10. min).
//
// Kaldes af:
//   1) trigger paa notifications INSERT (pg_net)  -> push, sub-sekund latens
//   2) pg_cron hvert 5. minut                     -> sikkerhedsnet for alt trigger'en missede
//
// verify_jwt=false MED VILJE: kalderen er databasen, ikke en bruger med JWT.
// Den reelle sikkerhedsgraense er NOTIFY_SECRET-headeren. Fail-closed: uden
// secret i env svarer funktionen 503 og roerer ingenting.
//
// Modsat n8n-versionen bruges retry_count og status='fejlet' faktisk:
// en mail der fejler 5 gange markeres fejlet i stedet for at blive proevet i det uendelige.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const NOTIFY_SECRET = Deno.env.get("NOTIFY_SECRET") ?? "";
const FROM = Deno.env.get("ENZO_MAIL_FROM") ?? "Casa Food <noreply@casa-food.dk>";

const MAX_FORSOEG = 5;
const BATCH = 50;

type Notifikation = {
  id: string;
  recipient: string | null;
  subject: string | null;
  body: string | null;
  retry_count: number;
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function db(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

async function markerSendt(id: string): Promise<void> {
  await db(`notifications?id=eq.${id}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ status: "sendt", sent_at: new Date().toISOString() }),
  });
}

async function markerFejl(n: Notifikation): Promise<void> {
  const forsoeg = (n.retry_count ?? 0) + 1;
  const opgiv = forsoeg >= MAX_FORSOEG;
  await db(`notifications?id=eq.${n.id}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(
      opgiv ? { retry_count: forsoeg, status: "fejlet" } : { retry_count: forsoeg },
    ),
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return json({ ok: false, fejl: "Method not allowed" }, 405);

  // Fail-closed. Uden konfigureret secret koerer funktionen ikke — den staar ikke aaben.
  if (!NOTIFY_SECRET) return json({ ok: false, fejl: "NOTIFY_SECRET ikke sat." }, 503);
  if (req.headers.get("x-notify-secret") !== NOTIFY_SECRET) {
    return json({ ok: false, fejl: "Ikke autoriseret." }, 401);
  }
  if (!RESEND_API_KEY) return json({ ok: false, fejl: "RESEND_API_KEY ikke sat." }, 503);

  const q = `notifications?status=eq.koe&channel=eq.email&retry_count=lt.${MAX_FORSOEG}` +
    `&select=id,recipient,subject,body,retry_count&order=created_at.asc&limit=${BATCH}`;

  const r = await db(q);
  if (!r.ok) {
    return json({ ok: false, fejl: `Kunne ikke laese koeen: ${r.status} ${await r.text()}` }, 502);
  }
  const koe: Notifikation[] = await r.json();
  if (koe.length === 0) return json({ ok: true, sendt: 0, fejlet: 0, tom: true }, 200);

  let sendt = 0;
  const fejl: { id: string; grund: string }[] = [];

  for (const n of koe) {
    if (!n.recipient) {
      await markerFejl(n);
      fejl.push({ id: n.id, grund: "ingen modtager" });
      continue;
    }
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: FROM,
          to: [n.recipient],
          subject: n.subject || "Besked fra Casa Food",
          text: n.body ?? "",
        }),
      });
      if (res.ok) {
        await markerSendt(n.id);
        sendt++;
      } else {
        await markerFejl(n);
        fejl.push({ id: n.id, grund: `resend ${res.status}: ${(await res.text()).slice(0, 200)}` });
      }
    } catch (e) {
      await markerFejl(n);
      fejl.push({ id: n.id, grund: String(e).slice(0, 200) });
    }
  }

  if (fejl.length > 0) console.error("enzo-notify fejl:", JSON.stringify(fejl));
  return json({ ok: fejl.length === 0, sendt, fejlet: fejl.length, fejl }, 200);
});
