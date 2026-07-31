import { ScrapedProductPreview, Marketplace } from "@afilimax/core";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

puppeteer.use(StealthPlugin());

export type MercadoLivreScraperOptions = {
  siteId?: string;
};

export type MercadoLivreScraperSearchProductsOptions = {
  query: string;
  limit?: number;
  offset?: number;
};

// Estrutura do JSON-LD embutido pela página de busca do Mercado Livre
type MercadoLivreJsonLdItem = {
  "@type": string;
  name: string;
  url?: string;
  image?: string | string[] | null;
  offers?: {
    "@type"?: string;
    price?: string | number;
    priceCurrency?: string;
    lowPrice?: string | number;
    highPrice?: string | number;
    url?: string;
  };
  brand?: { name: string } | string | null;
  aggregateRating?: {
    ratingValue?: string | number;
    ratingCount?: string | number;
    reviewCount?: string | number;
  } | null;
};

export class MercadoLivreScraper {
  private readonly siteId: string;
  private browser: any = null;

  constructor({ siteId = "MLB" }: MercadoLivreScraperOptions = {}) {
    this.siteId = siteId;
  }

  private getBaseUrl(): string {
    // MLB → brasil, MLA → argentina, etc.
    const domainMap: Record<string, string> = {
      MLB: "https://lista.mercadolivre.com.br",
      MLA: "https://listado.mercadolivre.com.ar",
      MLM: "https://listado.mercadolibre.com.mx",
    };
    return domainMap[this.siteId] ?? "https://lista.mercadolivre.com.br";
  }

  private parsePrice(raw: string | number | undefined | null): number | null {
    if (raw == null) return null;
    const n =
      typeof raw === "number" ? raw : parseFloat(String(raw).replace(",", "."));
    return isNaN(n) ? null : n;
  }

  private async getBrowser(): Promise<any> {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--window-size=1920,1080",
          "--disable-blink-features=AutomationControlled",
        ],
      });
    }
    return this.browser;
  }

  async searchProducts({
    query,
    limit = 20,
    offset = 0,
  }: MercadoLivreScraperSearchProductsOptions): Promise<
    ScrapedProductPreview[]
  > {
    const slug = query.trim().toLowerCase().replace(/\s+/g, "-");
    const base = this.getBaseUrl();
    // offset é convertido para o parâmetro _Desde (1-indexed, incrementos de 48)
    const desde = offset > 0 ? `_Desde_${offset + 1}` : "";
    const url = `${base}/${slug}${desde}`;

    const browser = await this.getBrowser();
    const page = await browser.newPage();

    let html = "";
    try {
      await page.setViewport({ width: 1920, height: 1080 });
      await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
      );
      await page.setExtraHTTPHeaders({
        "accept-language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
      });
      await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });
      await new Promise((r) => setTimeout(r, 3000));
      html = await page.content();
    } finally {
      await page.close();
    }

    const scrapedAt = new Date().toISOString();

    // Extrair todos os blocos JSON-LD da página
    const jsonLdMatches = [
      ...html.matchAll(
        /<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi,
      ),
    ];

    const items: ScrapedProductPreview[] = [];

    for (const match of jsonLdMatches) {
      let parsed: any;
      try {
        parsed = JSON.parse(match[1]);
      } catch {
        continue;
      }

      // O ML usa @graph com array de Products
      const candidates: MercadoLivreJsonLdItem[] = [];

      const graph = parsed["@graph"] ?? (Array.isArray(parsed) ? parsed : null);
      if (graph) {
        for (const node of graph) {
          if (node["@type"] === "Product" && node.name) candidates.push(node);
        }
      } else if (
        parsed["@type"] === "ItemList" &&
        Array.isArray(parsed.itemListElement)
      ) {
        for (const el of parsed.itemListElement) {
          const item = el.item ?? el;
          if (item?.name) candidates.push(item);
        }
      } else if (parsed["@type"] === "Product" && parsed.name) {
        candidates.push(parsed);
      }

      for (const item of candidates) {
        if (items.length >= limit) break;

        const priceRaw = item.offers?.price ?? item.offers?.lowPrice ?? null;
        const price = this.parsePrice(priceRaw);

        // A URL do produto está em offers.url ou no nível raiz
        const productUrl = item.offers?.url ?? item.url ?? null;

        const images = Array.isArray(item.image)
          ? item.image
          : item.image
            ? [item.image]
            : [];
        const thumbnail = images[0] ?? null;

        // Extrair externalId da URL (MLB1234567890 ou MLB-1234567890 ou p/MLB...)
        const externalIdMatch = productUrl?.match(/\/(MLB[\d-]+|p\/MLB\d+)/);
        const externalId = externalIdMatch
          ? externalIdMatch[1].replace("p/", "")
          : null;

        const brandRaw = item.brand;
        const brand =
          typeof brandRaw === "string"
            ? brandRaw
            : ((brandRaw as any)?.name ?? null);

        const ratingValue = item.aggregateRating?.ratingValue;
        const reviewCount =
          item.aggregateRating?.ratingCount ??
          item.aggregateRating?.reviewCount;
        const ratingAverage = this.parsePrice(ratingValue);
        const totalReviews =
          reviewCount != null ? parseInt(String(reviewCount), 10) : null;

        if (!item.name || !productUrl) continue;

        items.push({
          marketplace: Marketplace.MercadoLivre,
          externalId,
          title: item.name,
          url: productUrl,
          thumbnail,
          price: {
            value: price,
            originalValue: null,
            currency: "BRL",
          },
          rating:
            ratingAverage != null
              ? {
                  average: ratingAverage,
                  totalReviews: isNaN(totalReviews as number)
                    ? null
                    : totalReviews,
                }
              : null,
          brand,
          scrapedAt,
        });
      }

      if (items.length >= limit) break;
    }

    return items;
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}
