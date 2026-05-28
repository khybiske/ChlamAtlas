import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const ADMIN_EMAIL    = 'khybiske@uw.edu';
const FROM_EMAIL     = 'noreply@chlamatlas.org';

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  let body: { display_name?: string; email?: string; lab_affiliation?: string };
  try {
    body = await req.json();
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  const { display_name, email, lab_affiliation } = body;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `ChlamAtlas <${FROM_EMAIL}>`,
      to: ADMIN_EMAIL,
      subject: 'ChlamAtlas: New lab access request',
      html: `
        <p>A user has requested lab member access on ChlamAtlas.</p>
        <table style="border-collapse:collapse;font-family:sans-serif;font-size:14px;">
          <tr><td style="padding:4px 12px 4px 0;color:#6b7280;">Name</td><td><strong>${display_name || '(not set)'}</strong></td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#6b7280;">Email</td><td>${email || '(not set)'}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#6b7280;">Lab / Affiliation</td><td>${lab_affiliation || '(not set)'}</td></tr>
        </table>
        <p style="margin-top:16px;">
          <a href="https://chlamatlas.org" style="background:#1d4ed8;color:white;padding:8px 16px;border-radius:6px;text-decoration:none;font-size:13px;">Open ChlamAtlas Admin</a>
        </p>
      `,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('Resend error:', err);
    return new Response('Failed to send email', { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
