export interface PaymentPayload {
  name: string;
  email: string;
  cpf?: string;
  phone: string;
  amount: number;
  externalId: string;

  // ✅ itens
  items: {
    id: string;
    unitPrice: number;
    title: string;
    quantity: number;
    tangible: boolean;
  }[];

  // ✅ UTMs
  utmQuery?: { [key: string]: string };

  // ✅ TikTok attribution (melhora MUITO)
  ttclid?: string;    // vem da URL do anúncio do TikTok
  ttp?: string;       // cookie _ttp do pixel
  pageUrl?: string;   // URL atual
  referrer?: string;  // document.referrer
}
