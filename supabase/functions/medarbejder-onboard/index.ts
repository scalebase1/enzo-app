import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "content-type": "application/json",
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, content-type, apikey",
  "access-control-allow-methods": "POST, OPTIONS",
};

const DEFAULT_REDIRECT = Deno.env.get("ENZO_APP_URL") ?? "https://enzo.casa-food.dk";

function fejl(msg: string, status = 400): Response {
  return new Response(JSON.stringify({ ok: false, fejl: msg }), { status, headers: cors });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const admin = createClient(url, svc, { auth: { persistSession: false } });

    if (!token) return fejl("Mangler login.", 401);
    const asCaller = createClient(url, anon, { global: { headers: { Authorization: "Bearer " + token } }, auth: { persistSession: false } });
    const { data: u } = await asCaller.auth.getUser(token);
    const callerId = u?.user?.id ?? null;
    const { data: cfg } = await admin.from("business_config").select("value").eq("key", "admin_auth_id").single();
    const adminId = cfg?.value ?? null;
    if (!callerId || callerId !== adminId) return fejl("Kun William kan onboarde medarbejdere.", 403);

    const body = await req.json().catch(() => ({}));
    let staff_id = (body.staff_id ?? "").toString();
    const email = (body.email ?? "").toString().trim().toLowerCase();
    const navn = (body.navn ?? "").toString().trim();
    const timeloenRaw = body.timeloen;
    const timeloen = typeof timeloenRaw === "number" ? timeloenRaw : (parseFloat(String(timeloenRaw ?? "0")) || 0);
    const redirectTo = (body.redirectTo ?? "").toString().trim() || DEFAULT_REDIRECT;

    if (!email) return fejl("email kraeves - en medarbejder kan ikke inviteres uden.");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fejl("Ugyldig email: " + email);

    if (!staff_id) {
      if (!navn) return fejl("navn eller staff_id kraeves.");
      const { data: t, error: tErr } = await admin.rpc("tilfoej_medarbejder", { p_navn: navn, p_timeloen: timeloen, p_telefon: null });
      if (tErr) return fejl("Kunne ikke oprette medarbejder: " + tErr.message);
      if (!t || (t as any).ok === false) return fejl(((t as any) && (t as any).fejl) ? (t as any).fejl : "Kunne ikke oprette medarbejder.");
      staff_id = (t as any).id;
      if (!staff_id) return fejl("Medarbejder oprettet men id mangler.");
    }

    const { data: st } = await admin.from("staff").select("id, name, auth_user_id, onboarding_status").eq("id", staff_id).single();
    if (!st) return fejl("Medarbejder ikke fundet.", 404);

    const { data: konflikt } = await admin.from("staff").select("id, name").eq("email", email).neq("id", staff_id).maybeSingle();
    if (konflikt) return fejl("Emailen " + email + " bruges allerede af " + konflikt.name + ".");

    let authUserId: string | null = st.auth_user_id ?? null;
    let invited = false;
    let genbrugt = false;

    if (authUserId) {
      await admin.auth.admin.updateUserById(authUserId, { email });
    } else {
      const { data: inv, error: iErr } = await admin.auth.admin.inviteUserByEmail(email, {
        data: { rolle: "medarbejder", staff_id, navn: st.name },
        redirectTo,
      });

      if (inv?.user) {
        authUserId = inv.user.id;
        invited = true;
      } else {
        // Emailen har ALLEREDE et login i auth. Det sker naar en medarbejder
        // genoprettes, eller naar en adresse har vaeret brugt foer — fx efter en
        // nulstilling, hvor staff toemmes men auth.users bevares.
        //
        // Foer: invitationen fejlede, staff fik aldrig auth_user_id, og
        // medarbejderen fik et link der ikke virkede ("allerede oprettet").
        // Nu: vi finder den eksisterende bruger, genbruger den, og sender et
        // NULSTIL-link i stedet — for en bekraeftet konto kan ikke inviteres igen,
        // men ejeren skal stadig kunne saette en adgangskode.
        const findes = /already|registered|exists/i.test(iErr?.message ?? "");
        if (!findes) return fejl(iErr?.message ?? "Kunne ikke sende invitation.");

        const { data: liste, error: lErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
        if (lErr) return fejl("Emailen har allerede et login, men det kunne ikke slaas op: " + lErr.message);

        const fundet = liste?.users?.find(
          (u: { email?: string }) => (u.email ?? "").toLowerCase() === email.toLowerCase(),
        );
        if (!fundet) return fejl("Emailen " + email + " har allerede et login, men brugeren blev ikke fundet.");

        authUserId = fundet.id;

        // Metadata opdateres, saa den gamle konto peger paa den NYE staff-raekke.
        await admin.auth.admin.updateUserById(authUserId, {
          user_metadata: { rolle: "medarbejder", staff_id, navn: st.name },
        });

        const { error: rErr } = await admin.auth.resetPasswordForEmail(email, { redirectTo });
        if (rErr) console.error("kunne ikke sende nulstil-link:", rErr.message);
        genbrugt = true;
      }
    }

    const nyStatus = invited ? "inviteret" : (st.onboarding_status === "aktiv" ? "aktiv" : "inviteret");

    const { error: uErr } = await admin.from("staff")
      .update({ auth_user_id: authUserId, email, onboarding_status: nyStatus, active: true })
      .eq("id", staff_id);
    if (uErr) return fejl(uErr.message);

    return new Response(JSON.stringify({
      ok: true, navn: st.name, email, invited, genbrugt, auth_user_id: authUserId, staff_id,
      onboarding_status: nyStatus, redirect_to: redirectTo,
      besked: invited
        ? ("Invitation sendt til " + email + ". " + st.name + " staar som INVITERET og kan foerst faa vagter naar adgangskoden er sat.")
        : genbrugt
        ? (email + " havde allerede et login i systemet. Der er sendt et link til at vaelge ny adgangskode i stedet for en invitation - " + st.name + " kan logge ind naar den er sat.")
        : ("Medarbejder havde allerede et login; email opdateret til " + email + "."),
    }), { headers: cors });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, fejl: String((e as any)?.message ?? e) }), { status: 500, headers: cors });
  }
});
