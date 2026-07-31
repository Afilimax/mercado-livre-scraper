import { describe, it, expect, vi, beforeEach } from "vitest"
import { MercadoLivreScraper } from "../src/index"
import { Marketplace } from "@afilimax/core"

const sampleJsonLdHtml = `
<!DOCTYPE html>
<html>
<head>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Product",
      "name": "Echo Dot 5ª Geração",
      "brand": { "@type": "Brand", "name": "Amazon" },
      "offers": {
        "@type": "Offer",
        "price": 349.9,
        "priceCurrency": "BRL",
        "url": "https://www.mercadolivre.com.br/echo-dot-5/p/MLB123456"
      },
      "image": ["https://http2.mlstatic.com/D_NQ_NP_123456.jpg"],
      "aggregateRating": {
        "@type": "AggregateRating",
        "ratingValue": 4.8,
        "ratingCount": 1500
      }
    }
  ]
}
</script>
</head>
<body></body>
</html>
`

describe("MercadoLivreScraper – searchProducts", () => {
    let scraper: MercadoLivreScraper

    beforeEach(() => {
        scraper = new MercadoLivreScraper()
        vi.restoreAllMocks()
    })

    it("deve retornar um array de ScrapedProductPreview extraído do HTML JSON-LD", async () => {
        const mockPage = {
            setViewport: vi.fn().mockResolvedValue(undefined),
            goto: vi.fn().mockResolvedValue(undefined),
            content: vi.fn().mockResolvedValue(sampleJsonLdHtml),
            close: vi.fn().mockResolvedValue(undefined),
        }
        const mockBrowser = {
            newPage: vi.fn().mockResolvedValue(mockPage),
            close: vi.fn().mockResolvedValue(undefined),
        }

        vi.spyOn(scraper as any, "getBrowser").mockResolvedValue(mockBrowser)

        const results = await scraper.searchProducts({ query: "echo dot" })

        expect(Array.isArray(results)).toBe(true)
        expect(results.length).toBe(1)

        const item = results[0]
        expect(item.marketplace).toBe(Marketplace.MercadoLivre)
        expect(item.title).toBe("Echo Dot 5ª Geração")
        expect(item.externalId).toBe("MLB123456")
        expect(item.url).toBe("https://www.mercadolivre.com.br/echo-dot-5/p/MLB123456")
        expect(item.thumbnail).toBe("https://http2.mlstatic.com/D_NQ_NP_123456.jpg")
        expect(item.price.value).toBe(349.9)
        expect(item.brand).toBe("Amazon")
        expect(item.rating).toEqual({
            average: 4.8,
            totalReviews: 1500,
        })
        expect(typeof item.scrapedAt).toBe("string")
    })

    it("deve respeitar a propriedade siteId na URL base de busca", async () => {
        const mockPage = {
            setViewport: vi.fn().mockResolvedValue(undefined),
            goto: vi.fn().mockResolvedValue(undefined),
            content: vi.fn().mockResolvedValue(sampleJsonLdHtml),
            close: vi.fn().mockResolvedValue(undefined),
        }
        const mockBrowser = {
            newPage: vi.fn().mockResolvedValue(mockPage),
            close: vi.fn().mockResolvedValue(undefined),
        }

        const scraperMla = new MercadoLivreScraper({ siteId: "MLA" })
        vi.spyOn(scraperMla as any, "getBrowser").mockResolvedValue(mockBrowser)

        await scraperMla.searchProducts({ query: "notebook" })

        expect(mockPage.goto).toHaveBeenCalledWith(
            "https://listado.mercadolivre.com.ar/notebook",
            expect.objectContaining({ waitUntil: "networkidle2" })
        )
    })
})
