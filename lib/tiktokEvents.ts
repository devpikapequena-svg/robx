import crypto from 'crypto'
import { NextRequest } from 'next/server'

function sha256(v: string) {
  return crypto.createHash('sha256').update(v).digest('hex')
}

function normEmail(email?: string) {
  if (!email) return undefined
  const x = email.trim().toLowerCase()
  return x ? sha256(x) : undefined
}

function normPhone(phone?: string) {
  if (!phone) return undefined
  const digits = phone.replace(/\D/g, '')
  if (!digits) return undefined
  const e164 = digits.startsWith('55') ? `+${digits}` : `+55${digits}`
  return sha256(e164)
}

function getClientIp(req: NextRequest) {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0].trim()
  return req.headers.get('x-real-ip') || ''
}

export async function sendTikTokEvent(opts: {
  req: NextRequest
  event: 'InitiateCheckout' | 'Purchase' | 'ViewContent' | 'AddToCart'
  eventId: string
  email?: string
  phone?: string
  externalId?: string
  value: number
  currency?: string
  contents?: Array<{
    content_id: string
    content_name?: string
    quantity?: number
    price?: number
  }>
  url?: string
  referrer?: string
  ttclid?: string
  ttp?: string
}) {
  const pixelId = process.env.TIKTOK_PIXEL_ID
  const token = process.env.TIKTOK_ACCESS_TOKEN

  if (!pixelId || !token) {
    console.warn('[TikTok] Pixel ID ou Access Token ausente')
    return
  }

  const payload = {
    event_source: 'web',
    event_source_id: pixelId,
    data: [
      {
        event: opts.event,
        event_id: opts.eventId,
        event_time: Math.floor(Date.now() / 1000),
        page: {
          url: opts.url || '',
          referrer: opts.referrer || '',
        },
        properties: {
          currency: opts.currency || 'BRL',
          value: Number(opts.value.toFixed(2)),
          contents: opts.contents || [],
        },
        user: Object.fromEntries(
          Object.entries({
            ip: getClientIp(opts.req),
            user_agent: opts.req.headers.get('user-agent') || '',
            email: normEmail(opts.email),
            phone_number: normPhone(opts.phone),
            external_id: opts.externalId
              ? sha256(String(opts.externalId))
              : undefined,
            ttclid: opts.ttclid,
            ttp: opts.ttp,
          }).filter(([, v]) => v !== undefined && v !== '')
        ),
      },
    ],
  }

  console.log('[TikTok] Enviando evento:', {
    event: opts.event,
    event_id: opts.eventId,
    value: opts.value,
  })

  try {
    const res = await fetch(
      'https://business-api.tiktok.com/open_api/v1.3/event/track/',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Access-Token': token,
        },
        body: JSON.stringify(payload),
      }
    )

    const responseText = await res.text()

    console.log('[TikTok] Resposta status:', res.status)
    console.log('[TikTok] Resposta body:', responseText)
  } catch (err) {
    console.error('[TikTok] Erro ao enviar evento:', err)
  }
}
