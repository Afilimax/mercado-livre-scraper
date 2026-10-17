import StealthPlugin from "puppeteer-extra-plugin-stealth"
import puppeteer from "puppeteer-extra"
import path from "path"
import fs from "fs"

import { Marketplace, ScrapedProductPreview } from "@afilimax/core"

puppeteer.use(StealthPlugin())

export type MercadoLivreScraperOptions = {}

export type MercadoLivreScraperSearchProductsOptions = {
    query: string
    limit?: number
    offset?: number
}

export class MercadoLivreScraper {
    private browser: any = null

    constructor(_options: MercadoLivreScraperOptions = {}) {}

    private getSearchUrl(query: string, offset: number): string {
        const slug = query.trim().toLowerCase().replace(/\s+/g, "-")
        const offsetParam = offset > 0 ? `_Desde_${offset + 1}` : ""
        return `https://lista.mercadolivre.com.br/${slug}${offsetParam}`
    }

    private getHomepageUrl(): string {
        return "https://www.mercadolivre.com.br"
    }

    private parsePrice(raw: string | number | undefined | null): number | null {
        if (raw == null) return null
        const n = typeof raw === "number" ? raw : parseFloat(String(raw).replace(",", "."))
        return isNaN(n) ? null : n
    }

    private async getBrowser(): Promise<any> {
        if (!this.browser) {
            const chromePaths = [
                "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
                "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
            ]
            let executablePath: string | undefined
            for (const p of chromePaths) {
                if (fs.existsSync(p)) {
                    executablePath = p
                    break
                }
            }

            this.browser = await puppeteer.launch({
                headless: false,
                ...(executablePath ? { executablePath } : {}),
                args: [
                    "--no-sandbox",
                    "--disable-setuid-sandbox",
                    "--window-size=1920,1080",
                    "--window-position=-2000,-2000",
                    "--disable-blink-features=AutomationControlled",
                    "--disable-features=IsolateOrigins,site-per-process",
                    "--disable-web-security",
                ],
            })
        }
        return this.browser
    }

    async searchProducts({
        query,
        limit = 20,
        offset = 0,
    }: MercadoLivreScraperSearchProductsOptions): Promise<ScrapedProductPreview[]> {
        const url = this.getSearchUrl(query, offset)

        const browser = await this.getBrowser()
        const page = await browser.newPage()

        let html = ""
        try {
            await page.setViewport({ width: 1920, height: 1080 })

            // Navegar para a página de busca
            await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 })

            const finalUrl = typeof page.url === "function" ? page.url() : url
            console.log(`[ML Debug] URL final: ${finalUrl}`)

            // Se foi redirecionado para verificação/CAPTCHA, abortar cedo
            if (finalUrl.includes("account-verification") || finalUrl.includes("captcha")) {
                console.log("[ML Debug] Redirecionado para verificação/CAPTCHA, abortando.")
                html = ""
            } else {
                // Aguardar os cards de produto aparecerem (até 12s)
                try {
                    if (typeof page.waitForSelector === "function") {
                        await page.waitForSelector(".poly-card, .ui-search-result__content, ol.ui-search-layout", {
                            timeout: 12000,
                        })
                    }
                } catch {
                    // Continua mesmo se não encontrar o seletor
                }

                await new Promise((r) => setTimeout(r, 2000))
                html = await page.content()

                // === DIAGNÓSTICO: salvar HTML para inspeção ===
                const debugPath = path.resolve(process.cwd(), "debug-ml-output.html")
                fs.writeFileSync(debugPath, html, "utf-8")
                const jsonLdCount = (html.match(/application\/ld\+json/g) ?? []).length
                const polyCardCount = (html.match(/poly-card/g) ?? []).length
                console.log(`[ML Debug] HTML length: ${html.length}`)
                console.log(`[ML Debug] JSON-LD tags: ${jsonLdCount}`)
                console.log(`[ML Debug] poly-card occurrences: ${polyCardCount}`)
                console.log(`[ML Debug] HTML salvo em: ${debugPath}`)
            }
        } finally {
            await page.close()
        }

        const scrapedAt = new Date().toISOString()

        // Estratégia 1: Extrair via JSON-LD (@graph com Products)
        const jsonLdItems = this.extractFromJsonLd(html, limit, scrapedAt)
        console.log(`[ML Debug] JSON-LD extraiu: ${jsonLdItems.length} itens`)
        if (jsonLdItems.length > 0) {
            return jsonLdItems
        }

        // Estratégia 2: Extrair via seletores HTML dos cards .poly-card
        const htmlItems = this.extractFromHtml(html, limit, scrapedAt)
        console.log(`[ML Debug] HTML extrator extraiu: ${htmlItems.length} itens`)
        return htmlItems
    }

    private extractFromJsonLd(html: string, limit: number, scrapedAt: string): ScrapedProductPreview[] {
        const items: ScrapedProductPreview[] = []

        const jsonLdMatches = [...html.matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)]

        for (const match of jsonLdMatches) {
            let parsed: any
            try {
                parsed = JSON.parse(match[1])
            } catch {
                continue
            }

            const candidates: any[] = []

            const graph = parsed["@graph"] ?? (Array.isArray(parsed) ? parsed : null)
            if (graph) {
                for (const node of graph) {
                    if (node["@type"] === "Product" && node.name) candidates.push(node)
                }
            } else if (parsed["@type"] === "ItemList" && Array.isArray(parsed.itemListElement)) {
                for (const el of parsed.itemListElement) {
                    const item = el.item ?? el
                    if (item?.name) candidates.push(item)
                }
            } else if (parsed["@type"] === "Product" && parsed.name) {
                candidates.push(parsed)
            }

            for (const item of candidates) {
                if (items.length >= limit) break

                const priceRaw = item.offers?.price ?? item.offers?.lowPrice ?? null
                const price = this.parsePrice(priceRaw)
                const productUrl = item.offers?.url ?? item.url ?? null

                const images = Array.isArray(item.image) ? item.image : item.image ? [item.image] : []
                const thumbnail = images[0] ?? null

                const externalIdMatch = productUrl?.match(/\/(MLB[\d-]+|p\/MLB\d+)|[?&]wid=(MLB\d+)/)
                const externalId = externalIdMatch
                    ? (externalIdMatch[2] ?? externalIdMatch[1]?.replace("p/", "") ?? null)
                    : null

                const brandRaw = item.brand
                const brand = typeof brandRaw === "string" ? brandRaw : ((brandRaw as any)?.name ?? null)

                const ratingValue = item.aggregateRating?.ratingValue
                const reviewCount = item.aggregateRating?.ratingCount ?? item.aggregateRating?.reviewCount
                const ratingAverage = this.parsePrice(ratingValue)
                const totalReviews = reviewCount != null ? parseInt(String(reviewCount), 10) : null

                if (!item.name || !productUrl) continue

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
                                  totalReviews: isNaN(totalReviews as number) ? null : totalReviews,
                              }
                            : null,
                    brand,
                    scrapedAt,
                })
            }

            if (items.length >= limit) break
        }

        return items
    }

    private extractFromHtml(html: string, limit: number, scrapedAt: string): ScrapedProductPreview[] {
        const items: ScrapedProductPreview[] = []

        // Extrair blocos de cada card .poly-card usando regex no HTML bruto
        const cardRegex = /<div[^>]+class="[^"]*poly-card[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/gi
        const cardMatches = [...html.matchAll(cardRegex)]

        for (const cardMatch of cardMatches) {
            if (items.length >= limit) break

            const cardHtml = cardMatch[0]

            // Título e URL: link com classe poly-component__title
            const titleLinkMatch = cardHtml.match(
                /<a[^>]+class="[^"]*poly-component__title[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i,
            )
            if (!titleLinkMatch) continue

            const rawUrl = titleLinkMatch[1].replace(/&amp;/g, "&")
            const title = titleLinkMatch[2].replace(/<[^>]+>/g, "").trim()

            if (!title || !rawUrl) continue

            // Extrair wid=MLB... da URL de rastreamento (ID do produto)
            const widMatch = rawUrl.match(/[?&]wid=(MLB\d+)/)
            // Fallback: MLB direto na URL
            const directIdMatch = rawUrl.match(/\/(MLB[\d-]+)/)
            const externalId = widMatch ? widMatch[1] : directIdMatch ? directIdMatch[1] : null

            // Construir URL canônica se possível
            const productUrl =
                externalId && !rawUrl.includes("click1.mercadolivre")
                    ? rawUrl
                    : externalId
                      ? `https://www.mercadolivre.com.br/p/${externalId}`
                      : rawUrl

            // Preço atual: fração principal dentro de poly-price__current
            const priceCurrentMatch = cardHtml.match(
                /<div[^>]+class="[^"]*poly-price__current[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
            )
            let priceValue: number | null = null
            if (priceCurrentMatch) {
                const priceBlock = priceCurrentMatch[1]
                const fractionMatch = priceBlock.match(/<span[^>]+andes-money-amount__fraction[^>]*>(\d+)<\/span>/i)
                const centsMatch = priceBlock.match(/<span[^>]+andes-money-amount__cents[^>]*>(\d+)<\/span>/i)
                if (fractionMatch) {
                    const fraction = parseInt(fractionMatch[1], 10)
                    const cents = centsMatch ? parseInt(centsMatch[1], 10) : 0
                    priceValue = parseFloat(`${fraction}.${String(cents).padStart(2, "0")}`)
                }
            }

            // Preço original (riscado), quando há desconto
            const priceOriginalMatch = cardHtml.match(
                /<s[^>]+class="[^"]*andes-money-amount--previous[^"]*"[^>]*>([\s\S]*?)<\/s>/i,
            )
            let originalValue: number | null = null
            if (priceOriginalMatch) {
                const origBlock = priceOriginalMatch[1]
                const fractionMatch = origBlock.match(/<span[^>]+andes-money-amount__fraction[^>]*>(\d+)<\/span>/i)
                const centsMatch = origBlock.match(/<span[^>]+andes-money-amount__cents[^>]*>(\d+)<\/span>/i)
                if (fractionMatch) {
                    const fraction = parseInt(fractionMatch[1], 10)
                    const cents = centsMatch ? parseInt(centsMatch[1], 10) : 0
                    originalValue = parseFloat(`${fraction}.${String(cents).padStart(2, "0")}`)
                }
            }

            // Thumbnail: img com classe poly-component__picture
            const thumbnailMatch = cardHtml.match(
                /<img[^>]+class="[^"]*poly-component__picture[^"]*"[^>]+src="([^"]+)"/i,
            )
            const thumbnail = thumbnailMatch ? thumbnailMatch[1] : null

            // Rating: span com classe polylabel-label dentro de poly-component__review-compacted
            const ratingBlockMatch = cardHtml.match(
                /<span[^>]+class="[^"]*poly-component__review-compacted[^"]*"[^>]*>([\s\S]*?)<\/span>\s*<\/span>/i,
            )
            let ratingAverage: number | null = null
            if (ratingBlockMatch) {
                const ratingMatch = ratingBlockMatch[1].match(
                    /<span[^>]+class="[^"]*polylabel-label[^"]*"[^>]*>([\d,.]+)<\/span>/i,
                )
                if (ratingMatch) {
                    ratingAverage = parseFloat(ratingMatch[1].replace(",", "."))
                }
            }

            // Vendedor: span com classe poly-component__seller
            const sellerMatch = cardHtml.match(
                /<span[^>]+class="[^"]*poly-component__seller[^"]*"[^>]*>([\s\S]*?)<\/span>/i,
            )
            const brand = sellerMatch ? sellerMatch[1].replace(/<[^>]+>/g, "").trim() || null : null

            items.push({
                marketplace: Marketplace.MercadoLivre,
                externalId,
                title,
                url: productUrl,
                thumbnail,
                price: {
                    value: priceValue,
                    originalValue,
                    currency: "BRL",
                },
                rating: ratingAverage != null ? { average: ratingAverage, totalReviews: null } : null,
                brand,
                scrapedAt,
            })
        }

        return items
    }

    async close() {
        if (this.browser) {
            await this.browser.close()
            this.browser = null
        }
    }
}
