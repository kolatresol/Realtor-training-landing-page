// Vercel Serverless Function — Meta Conversions API relay
// Keeps the CAPI access token server-side only (never exposed to the browser).
// Configure the real token as an environment variable in Vercel:
//   Settings → Environment Variables → META_CAPI_ACCESS_TOKEN
//
// Frontend calls this endpoint (POST /api/conversion) instead of talking to
// Meta directly, sending only the event name and any non-sensitive event data.

const PIXEL_ID = '1013496558315196';
const GRAPH_API_VERSION = 'v21.0';

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const accessToken = process.env.META_CAPI_ACCESS_TOKEN;
  if (!accessToken) {
    return res.status(500).json({ error: 'Server not configured: missing META_CAPI_ACCESS_TOKEN' });
  }

  const { eventName, eventId, eventSourceUrl, userData } = req.body || {};

  if (!eventName) {
    return res.status(400).json({ error: 'eventName is required' });
  }

  const clientIp =
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    '';
  const userAgent = req.headers['user-agent'] || '';

  const payload = {
    data: [
      {
        event_name: eventName,
        event_time: Math.floor(Date.now() / 1000),
        event_id: eventId || undefined,
        event_source_url: eventSourceUrl || undefined,
        action_source: 'website',
        user_data: {
          client_ip_address: clientIp,
          client_user_agent: userAgent,
          // Add hashed email/phone here later if you want richer match quality,
          // e.g. em: [sha256(email)], ph: [sha256(phone)]
          ...(userData || {}),
        },
      },
    ],
  };

  try {
    const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${PIXEL_ID}/events?access_token=${accessToken}`;
    const metaRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const metaJson = await metaRes.json();

    if (!metaRes.ok) {
      console.error('Meta CAPI error:', metaJson);
      return res.status(502).json({ error: 'Meta CAPI request failed', details: metaJson });
    }

    return res.status(200).json({ success: true, result: metaJson });
  } catch (err) {
    console.error('CAPI relay error:', err);
    return res.status(500).json({ error: 'Internal error relaying event' });
  }
};
