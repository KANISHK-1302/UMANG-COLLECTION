// Supabase Edge Function: send-donor-otp
// Generates a 6-digit OTP, stores a hash in donor_otps, and sends it via Gmail SMTP (Nodemailer).
// Deploy: supabase functions deploy send-donor-otp --no-verify-jwt

import { createClient } from "jsr:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer";

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email } = await req.json();

    if (!email || typeof email !== "string") {
      return new Response(
        JSON.stringify({ error: "Email is required." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Rate limiting: max 3 OTPs per email per 10 minutes
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { count } = await supabaseAdmin
      .from("donor_otps")
      .select("*", { count: "exact", head: true })
      .eq("email", email)
      .gte("created_at", tenMinutesAgo);

    if ((count ?? 0) >= 3) {
      return new Response(
        JSON.stringify({ error: "Too many OTP requests. Please wait before requesting a new code." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generate a cryptographically secure 6-digit OTP
    const otp = String(Math.floor(100000 + crypto.getRandomValues(new Uint32Array(1))[0] % 900000));
    const salt = crypto.randomUUID();
    const otpHash = await hashOtp(otp, salt);

    // Store OTP hash + salt with 10-minute expiry
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const { error: insertError } = await supabaseAdmin
      .from("donor_otps")
      .insert({ email, otp_hash: otpHash, salt, expires_at: expiresAt });

    if (insertError) {
      console.error("OTP insert error:", insertError);
      throw new Error("Failed to store OTP.");
    }

    // Load and parse multiple credentials for Load Balancing (Randomized)
    const credentialsRaw = Deno.env.get('GMAIL_CREDENTIALS');
    if (!credentialsRaw) {
      throw new Error("No GMAIL_CREDENTIALS found in Supabase Secrets.");
    }

    const credentialsList = credentialsRaw.split(',').map((c: string) => c.trim()).filter(Boolean);
    if (credentialsList.length === 0) {
      throw new Error("GMAIL_CREDENTIALS secret is empty or invalid format.");
    }

    // Pick a random credential from the list (Load Balancing)
    const randomCred = credentialsList[Math.floor(Math.random() * credentialsList.length)];
    const [senderEmail, senderPass] = randomCred.split(':');

    if (!senderEmail || !senderPass) {
      throw new Error("Invalid credential format in GMAIL_CREDENTIALS. Expected email:password");
    }

    // Send email via Gmail SMTP (Nodemailer)
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: senderEmail,
        pass: senderPass
      }
    });

    await transporter.sendMail({
      from: `"UMANG Collection'26" <${senderEmail}>`,
      to: email,
      subject: "Your UMANG Donation Verification Code",
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
          <h2 style="color: #1c1917; font-size: 24px; margin-bottom: 8px;">Donation Verification</h2>
          <p style="color: #78716c; margin-bottom: 24px;">
            A volunteer is recording a donation on your behalf at the UMANG Fundraiser Drive.
            Use the code below to confirm your consent.
          </p>
          <div style="background: #f5f5f4; border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 24px;">
            <p style="color: #78716c; font-size: 12px; text-transform: uppercase; letter-spacing: 0.1em; margin: 0 0 8px;">Your verification code</p>
            <p style="font-size: 40px; font-weight: bold; color: #1c1917; letter-spacing: 0.2em; margin: 0;">${otp}</p>
          </div>
          <p style="color: #a8a29e; font-size: 13px;">
            This code expires in <strong>10 minutes</strong>. If you did not authorize this, please ignore this email.
          </p>
        </div>
      `,
    });

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("send-donor-otp error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
