import { NextRequest, NextResponse } from 'next/server'
import { sendOrderToUtmify, formatToUtmifyDate } from '@/lib/utmifyService'
import { UtmifyOrderPayload } from '@/interfaces/utmify'
import { sendTikTokEvent } from '@/lib/tiktokEvents'  // <- CORREÇÃO DO IMPORT

export async function POST(request: NextRequest) {
  let requestBody
  try {
    requestBody = await request.json()

    const { event, data } = requestBody
    if (!event || !data || !data.id || !data.status) {
      return NextResponse.json({ error: 'Payload inválido' }, { status: 400 })
    }

    const transactionId = data.id

    // ✅ Apenas se o pagamento estiver aprovado
    if (
      event === 'transaction.processed' &&
      (data.status === 'paid' || data.status === 'approved')
    ) {
      const buckpayData = data
      const tracking = buckpayData.tracking || {}
      const utm = tracking.utm || {}

      // Normaliza produtos
      let productsForUtmify: UtmifyOrderPayload['products'] = []
      if (buckpayData.items && Array.isArray(buckpayData.items)) {
        productsForUtmify = buckpayData.items.map((item: any) => ({
          id: item.id || `prod_${Date.now()}`,
          name: item.name || item.title || 'Produto',
          planId: null,
          planName: null,
          quantity: item.quantity || 1,
          priceInCents: item.amount || item.discount_price || 0,
        }))
      } else if (buckpayData.offer) {
        productsForUtmify = [
          {
            id: buckpayData.offer.id || `prod_${Date.now()}`,
            name: buckpayData.offer.name || buckpayData.offer.title || 'Produto',
            planId: null,
            planName: null,
            quantity: buckpayData.offer.quantity || 1,
            priceInCents: buckpayData.offer.amount || buckpayData.offer.discount_price || 0,
          },
        ]
      } else {
        productsForUtmify = [
          {
            id: `prod_${Date.now()}`,
            name: 'Produto',
            planId: null,
            planName: null,
            quantity: 1,
            priceInCents: buckpayData.total_amount || 0,
          },
        ]
      }

      const ip = request.headers.get('x-forwarded-for') ?? '127.0.0.1'

      // ✅ UTMify paid
      const utmifyPayload: UtmifyOrderPayload = {
        orderId: buckpayData.id,
        platform: 'Bruxin',
        paymentMethod: 'pix',
        status: 'paid',
        createdAt: formatToUtmifyDate(new Date(buckpayData.created_at)),
        approvedDate: formatToUtmifyDate(new Date()),
        refundedAt: null,
        customer: {
          name: buckpayData.buyer?.name,
          email: buckpayData.buyer?.email,
          phone: buckpayData.buyer?.phone?.replace(/\D/g, '') || null,
          document: buckpayData.buyer?.document?.replace(/\D/g, '') || null,
          country: 'BR',
          ip,
        },
        products: productsForUtmify,
        trackingParameters: {
          src: tracking.src || null,
          sck: tracking.sck || null,
          utm_source: utm.source || null,
          utm_campaign: utm.campaign || null,
          utm_medium: utm.medium || null,
          utm_content: utm.content || null,
          utm_term: utm.term || null,
        },
        commission: {
          totalPriceInCents: buckpayData.total_amount,
          gatewayFeeInCents: buckpayData.total_amount - buckpayData.net_amount,
          userCommissionInCents: buckpayData.total_amount,
          currency: 'BRL',
        },
        isTest: false,
      }

      await sendOrderToUtmify(utmifyPayload)

      // ✅ TikTok: Purchase no webhook (evento real)
      // dedupe com event_id fixo:
      const extId = buckpayData.external_id || buckpayData.externalId || transactionId

      await sendTikTokEvent({
        req: request,
        event: 'Purchase',
        eventId: `${extId}_purchase`,
        email: buckpayData.buyer?.email,
        phone: buckpayData.buyer?.phone,
        externalId: String(extId),
        value: (Number(buckpayData.total_amount || 0) / 100) || 0,
        currency: 'BRL',
        contents: productsForUtmify.map((p) => ({
          content_id: String(p.id || p.name),
          content_name: p.name,
          quantity: p.quantity || 1,
          price: (Number(p.priceInCents || 0) / 100) || 0,
        })),
      })

      console.log(`[Webhook BuckPay] Pedido ${transactionId} enviado para UTMify + TikTok com sucesso.`)
    }

    return NextResponse.json({
      success: true,
      message: 'Webhook processado com sucesso',
    })
  } catch (error: any) {
    console.error('[Webhook BuckPay] Erro fatal:', error)
    return NextResponse.json({ error: 'Erro interno no servidor' }, { status: 500 })
  }
}
