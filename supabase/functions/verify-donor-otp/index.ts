// Supabase Edge Function: verify-donor-otp
// Verifies the 4-digit OTP against the stored hash and marks it as used.
// Deploy: supabase functions deploy verify-donor-otp

import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function hashOtp(otp: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(otp + salt);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Timing-safe string comparison to prevent timing attacks
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, otp, donationData } = await req.json();

    if (!email || !otp || typeof otp !== "string" || otp.length !== 4) {
      return new Response(
        JSON.stringify({ error: "Valid email and 4-digit OTP are required." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Fetch the latest valid (unexpired, unused) OTP record for this email
    const { data: record, error: fetchError } = await supabaseAdmin
      .from("donor_otps")
      .select("id, otp_hash, salt, expires_at, used, attempts")
      .eq("email", email)
      .eq("used", false)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fetchError) {
      console.error("OTP fetch error:", fetchError);
      throw new Error("Database error during verification.");
    }

    if (!record) {
      return new Response(
        JSON.stringify({ error: "No valid OTP found. Please request a new code." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Cap attempts at 5 to prevent brute force
    const attempts = (record.attempts ?? 0) + 1;
    if (attempts > 5) {
      await supabaseAdmin
        .from("donor_otps")
        .update({ used: true }) // invalidate after 5 wrong attempts
        .eq("id", record.id);
      return new Response(
        JSON.stringify({ error: "Too many incorrect attempts. Please request a new code." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify the OTP using the stored salt
    const computedHash = await hashOtp(otp, record.salt);
    const isValid = timingSafeEqual(computedHash, record.otp_hash);

    if (!isValid) {
      // Increment attempt count
      await supabaseAdmin
        .from("donor_otps")
        .update({ attempts })
        .eq("id", record.id);

      const remaining = 5 - attempts;
      return new Response(
        JSON.stringify({
          error: remaining > 0
            ? `Incorrect code. ${remaining} attempt${remaining !== 1 ? "s" : ""} remaining.`
            : "Too many incorrect attempts. Please request a new code.",
          invalidated: remaining <= 0,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Mark OTP as used (one-time use enforced)
    await supabaseAdmin
      .from("donor_otps")
      .update({ used: true })
      .eq("id", record.id);

    // --- SECURE DONATION INSERTION ---
    if (donationData) {
      // Get volunteer info from the request's Authorization header
      const authHeader = req.headers.get("Authorization");
      let volunteerEmail = "unknown";
      
      if (authHeader) {
        const tempClient = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_ANON_KEY")!,
          { global: { headers: { Authorization: authHeader } } }
        );
        const { data: { user } } = await tempClient.auth.getUser();
        volunteerEmail = user?.email || "unknown";
      }

      const { error: insertError } = await supabaseAdmin
        .from("donations")
        .insert({
          bitsId: donationData.bitsId,
          amount: donationData.amount,
          paymentMode: donationData.paymentMode,
          volunteerEmail: volunteerEmail,
          volunteerName: donationData.volunteerName || "Unknown",
          timestamp: new Date().toISOString()
        });

      if (insertError) {
        console.error("Donation record error:", insertError);
        throw new Error("OTP verified, but failed to record donation.");
      }
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("verify-donor-otp error:", err);
    return new Response(
      JSON.stringify({ error: err.stack || err.message || "Unknown Internal Server Error" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
