// Vercel Serverless Function — creates a Lead record in Zoho CRM
//
// Required environment variables (Vercel → Settings → Environment Variables):
//   ZOHO_CRM_CLIENT_ID      OAuth Self Client ID
//   ZOHO_CRM_CLIENT_SECRET  OAuth Self Client Secret
//   ZOHO_CRM_REFRESH_TOKEN  Long-lived refresh token (generated once, does not expire)
//   ZOHO_CRM_API_DOMAIN     e.g. https://www.zohoapis.com (returned when the refresh token was issued)

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const {
    ZOHO_CRM_CLIENT_ID,
    ZOHO_CRM_CLIENT_SECRET,
    ZOHO_CRM_REFRESH_TOKEN,
    ZOHO_CRM_API_DOMAIN,
  } = process.env;

  if (!ZOHO_CRM_CLIENT_ID || !ZOHO_CRM_CLIENT_SECRET || !ZOHO_CRM_REFRESH_TOKEN) {
    return res.status(500).json({ error: 'Server not configured: missing Zoho CRM credentials' });
  }

  const { name, phone, email } = req.body || {};
  if (!name || !phone || !email) {
    return res.status(400).json({ error: 'name, phone, and email are required' });
  }

  try {
    // 1. Access tokens expire hourly — exchange the refresh token for a fresh one on every call.
    const tokenRes = await fetch('https://accounts.zoho.com/oauth/v2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: ZOHO_CRM_CLIENT_ID,
        client_secret: ZOHO_CRM_CLIENT_SECRET,
        refresh_token: ZOHO_CRM_REFRESH_TOKEN,
      }),
    });
    const tokenJson = await tokenRes.json();

    if (!tokenRes.ok || !tokenJson.access_token) {
      console.error('Zoho token refresh failed:', tokenJson);
      return res.status(502).json({ error: 'Failed to refresh Zoho access token', details: tokenJson });
    }

    const apiDomain = ZOHO_CRM_API_DOMAIN || 'https://www.zohoapis.com';

    // 2. Leads module requires Last_Name — split the full name as a best effort.
    const parts = name.trim().split(/\s+/);
    const lastName = parts.length > 1 ? parts.pop() : parts[0];
    const firstName = parts.join(' ');

    // 3. Create the Lead.
    const leadRes = await fetch(`${apiDomain}/crm/v2/Leads`, {
      method: 'POST',
      headers: {
        Authorization: `Zoho-oauthtoken ${tokenJson.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data: [
          {
            Last_Name: lastName,
            First_Name: firstName,
            Email: email,
            Phone: phone,
            Lead_Source: 'Website - Masterclass Landing Page',
          },
        ],
      }),
    });

    const leadJson = await leadRes.json();

    if (!leadRes.ok) {
      console.error('Zoho CRM lead creation failed:', leadJson);
      return res.status(502).json({ error: 'Failed to create lead in Zoho CRM', details: leadJson });
    }

    return res.status(200).json({ success: true, result: leadJson });
  } catch (err) {
    console.error('submit-lead error:', err);
    return res.status(500).json({ error: 'Internal error creating lead' });
  }
};
