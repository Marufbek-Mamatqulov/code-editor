// Vercel serverless function — Piston API proxy
// Browser (HTTPS) → this function → VPS Piston (HTTP, server-to-server)
const PISTON_URL = 'http://31.220.86.100:2000/api/v2/execute'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body)

    const upstream = await fetch(PISTON_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: AbortSignal.timeout(15000),
    })

    const data = await upstream.json()
    res.status(upstream.status).json(data)
  } catch (err) {
    res.status(502).json({ error: 'Piston server bilan aloqa yo\'q: ' + err.message })
  }
}
