import fs from "fs"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { MercadoLivreScraper } from "../src/index"

const puppeteerMock = vi.hoisted(() => ({ launch: vi.fn(), use: vi.fn() }))

vi.mock("puppeteer-extra", () => ({ default: puppeteerMock }))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ld = (data: unknown) => `<script type="application/ld+json">${JSON.stringify(data)}</script>`

const money = (fraction: number | null, cents: number | null = null) =>
    (fraction === null ? "" : `<span class="andes-money-amount__fraction">${fraction}</span>`) +
    (cents === null ? "" : `<span class="andes-money-amount__cents">${cents}</span>`)

type CardParts = {
    href?: string | null
    title?: string
    current?: string | null
    previous?: string | null
    img?: string | null
    rating?: string | null
    seller?: string | null
}

const card = ({
    href = "https://www.mercadolivre.com.br/produto/p/MLB111?x=1",
    title = "Produto",
    current = money(10, 50),
    previous = null,
    img = null,
    rating = null,
    seller = null,
}: CardParts = {}) =>
    `<div class="poly-card poly-card--grid">` +
    (href === null ? "" : `<a class="poly-component__title" href="${href}">${title}</a>`) +
    (current === null ? "" : `<div class="poly-price__current">${current}</div>`) +
    (previous === null ? "" : `<s class="andes-money-amount andes-money-amount--previous">${previous}</s>`) +
    (img === null ? "" : `<img class="poly-component__picture" src="${img}">`) +
    (rating === null ? "" : `<span class="poly-component__review-compacted">${rating}</span></span>`) +
    (seller === null ? "" : `<span class="poly-component__seller">${seller}</span>`) +
    `</div></div></div>`

const makeScraper = (options = {}) => new MercadoLivreScraper(options) as any
const jsonLd = (html: string, limit = 20) => makeScraper().extractFromJsonLd(html, limit, "now")
const cards = (html: string, limit = 20) => makeScraper().extractFromHtml(html, limit, "now")
const parse = (html: string, url = "https://produto.mercadolivre.com.br/MLB-123") =>
    makeScraper().parseProductPage(html, url)

function makePage(overrides: Record<string, unknown> = {}) {
    return {
        setViewport: vi.fn(),
        goto: vi.fn(),
        url: vi.fn(() => "https://lista.mercadolivre.com.br/fone"),
        waitForSelector: vi.fn().mockResolvedValue(undefined),
        content: vi.fn().mockResolvedValue("<html></html>"),
        close: vi.fn(),
        ...overrides,
    }
}

function useBrowser(page: unknown) {
    const browser = { newPage: vi.fn().mockResolvedValue(page), close: vi.fn() }
    puppeteerMock.launch.mockResolvedValue(browser)
    return browser
}

beforeEach(() => {
    vi.restoreAllMocks()
    puppeteerMock.launch.mockReset()
    delete process.env.DEBUG
})

afterEach(() => {
    vi.useRealTimers()
    delete process.env.DEBUG
})

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

describe("constructor, urls and parsePrice", () => {
    it("builds search urls", () => {
        const scraper = makeScraper()

        expect(scraper.getSearchUrl("  Fone  Bluetooth ", 0)).toBe("https://lista.mercadolivre.com.br/fone-bluetooth")
        expect(scraper.getSearchUrl("fone", 20)).toBe("https://lista.mercadolivre.com.br/fone_Desde_21")
        expect(scraper.getHomepageUrl()).toBe("https://www.mercadolivre.com.br")
    })

    it.each([
        [null, null],
        [undefined, null],
        [12, 12],
        ["12,5", 12.5],
        ["abc", null],
    ])("parsePrice(%s) -> %s", (input, expected) => {
        expect(makeScraper().parsePrice(input)).toBe(expected)
    })

    it("defaults headless to true, even when explicitly undefined", () => {
        expect(makeScraper().options.headless).toBe(true)
        expect(makeScraper({ headless: false }).options.headless).toBe(false)
    })
})

// ---------------------------------------------------------------------------
// Browser handling
// ---------------------------------------------------------------------------

describe("getBrowser and close", () => {
    it("launches with the first installed chrome and caches the browser", async () => {
        const browser = useBrowser(makePage())
        vi.spyOn(fs, "existsSync").mockReturnValue(true)
        const scraper = makeScraper()

        expect(await scraper.getBrowser()).toBe(browser)
        expect(await scraper.getBrowser()).toBe(browser)

        expect(puppeteerMock.launch).toHaveBeenCalledTimes(1)
        expect(puppeteerMock.launch.mock.calls[0][0]).toMatchObject({ headless: true })
        expect(puppeteerMock.launch.mock.calls[0][0].executablePath).toContain("Program Files\\Google")
    })

    it("falls back to the x86 chrome path", async () => {
        useBrowser(makePage())
        vi.spyOn(fs, "existsSync").mockImplementation((p) => String(p).includes("(x86)"))

        await makeScraper().getBrowser()

        expect(puppeteerMock.launch.mock.calls[0][0].executablePath).toContain("(x86)")
    })

    it("launches without an executable path when chrome is not found", async () => {
        useBrowser(makePage())
        vi.spyOn(fs, "existsSync").mockReturnValue(false)

        await makeScraper({ headless: undefined }).getBrowser()

        expect(puppeteerMock.launch.mock.calls[0][0]).not.toHaveProperty("executablePath")
        expect(puppeteerMock.launch.mock.calls[0][0].headless).toBe(true)
    })

    it("close does nothing without a browser and closes an open one", async () => {
        await expect(makeScraper().close()).resolves.toBeUndefined()

        const browser = useBrowser(makePage())
        const scraper = makeScraper()
        await scraper.getBrowser()
        await scraper.close()

        expect(browser.close).toHaveBeenCalled()
        expect(scraper.browser).toBeNull()
    })
})

// ---------------------------------------------------------------------------
// searchProducts
// ---------------------------------------------------------------------------

describe("searchProducts", () => {
    const productLd = ld({ "@type": "Product", name: "Do JSON-LD", url: "https://produto.mercadolivre.com.br/MLB-1-x" })

    async function search(page: unknown, options: Record<string, unknown> = {}) {
        vi.useFakeTimers()
        useBrowser(page)
        const promise = makeScraper().searchProducts({ query: "fone", ...options })
        const settled = promise.then(
            (value: unknown) => ({ value }),
            (error: unknown) => ({ error }),
        )
        await vi.runAllTimersAsync()
        return settled as Promise<{ value?: any[]; error?: Error }>
    }

    it("returns the json-ld results", async () => {
        const page = makePage({ content: vi.fn().mockResolvedValue(productLd) })

        const { value } = await search(page, { offset: 20, limit: 5 })

        expect(value).toHaveLength(1)
        expect(value![0].title).toBe("Do JSON-LD")
        expect(page.goto).toHaveBeenCalledWith("https://lista.mercadolivre.com.br/fone_Desde_21", {
            waitUntil: "networkidle2",
            timeout: 30000,
        })
        expect(page.close).toHaveBeenCalled()
    })

    it("falls back to the html cards when there is no json-ld", async () => {
        const page = makePage({ content: vi.fn().mockResolvedValue(card({ title: "Do Card" })) })

        const { value } = await search(page)

        expect(value!.map((i) => i.title)).toEqual(["Do Card"])
    })

    it("works when the page has no url() or waitForSelector()", async () => {
        const page = makePage({
            url: undefined,
            waitForSelector: undefined,
            content: vi.fn().mockResolvedValue(productLd),
        })

        const { value } = await search(page)

        expect(value).toHaveLength(1)
    })

    it("continues when the result selector never appears", async () => {
        const page = makePage({
            waitForSelector: vi.fn().mockRejectedValue(new Error("timeout")),
            content: vi.fn().mockResolvedValue(productLd),
        })

        const { value } = await search(page)

        expect(value).toHaveLength(1)
    })

    it.each(["https://www.mercadolivre.com/account-verification", "https://www.mercadolivre.com/captcha"])(
        "aborts early when redirected to %s",
        async (finalUrl) => {
            const page = makePage({ url: vi.fn(() => finalUrl) })

            const { value } = await search(page)

            expect(value).toEqual([])
            expect(page.content).not.toHaveBeenCalled()
        },
    )

    it("logs debug information when DEBUG is set", async () => {
        process.env.DEBUG = "1"
        const log = vi.spyOn(console, "log").mockImplementation(() => {})

        await search(makePage({ content: vi.fn().mockResolvedValue(productLd) }))
        await search(makePage({ content: vi.fn().mockResolvedValue(card()) }))
        await search(makePage({ url: vi.fn(() => "https://x/captcha") }))

        const messages = log.mock.calls.map(([m]) => String(m))
        expect(messages.some((m) => m.includes("URL final"))).toBe(true)
        expect(messages.some((m) => m.includes("JSON-LD extraiu: 1"))).toBe(true)
        expect(messages.some((m) => m.includes("HTML extrator extraiu: 1"))).toBe(true)
        expect(messages.some((m) => m.includes("Redirecionado para verificação"))).toBe(true)
    })

    it("closes the page when navigation fails", async () => {
        const page = makePage({ goto: vi.fn().mockRejectedValue(new Error("boom")) })

        const { error } = await search(page)

        expect(error?.message).toBe("boom")
        expect(page.close).toHaveBeenCalled()
    })
})

// ---------------------------------------------------------------------------
// extractFromJsonLd
// ---------------------------------------------------------------------------

describe("extractFromJsonLd", () => {
    const product = (extra: Record<string, unknown> = {}) => ({
        "@type": "Product",
        name: "Produto",
        url: "https://produto.mercadolivre.com.br/MLB-123-produto",
        ...extra,
    })

    it("ignores invalid json and unknown structures", () => {
        const html = `<script type="application/ld+json">not json</script>${ld({ "@type": "Organization" })}${ld({ "@type": "Product" })}`

        expect(jsonLd(html)).toEqual([])
    })

    it("reads Products from @graph, skipping other nodes and unnamed products", () => {
        const html = ld({ "@graph": [{ "@type": "Organization", name: "x" }, { "@type": "Product" }, product()] })

        expect(jsonLd(html)).toHaveLength(1)
    })

    it("reads Products from a top-level array", () => {
        expect(jsonLd(ld([product()]))).toHaveLength(1)
    })

    it("reads ItemList elements, with or without the item wrapper", () => {
        const html = ld({
            "@type": "ItemList",
            itemListElement: [{ item: product({ name: "A" }) }, product({ name: "B" }), { item: { url: "x" } }],
        })

        expect(jsonLd(html).map((i: any) => i.title)).toEqual(["A", "B"])
    })

    it("reads a single Product", () => {
        expect(jsonLd(ld(product()))).toHaveLength(1)
    })

    it("respects the limit within and across scripts", () => {
        const many = ld({ "@graph": [product({ name: "A" }), product({ name: "B" }), product({ name: "C" })] })

        expect(jsonLd(many, 2)).toHaveLength(2)
        expect(jsonLd(`${ld(product({ name: "A" }))}${ld(product({ name: "B" }))}`, 1)).toHaveLength(1)
    })

    it("skips products without a url", () => {
        expect(jsonLd(ld(product({ url: undefined })))).toEqual([])
    })

    it.each([
        ["offers.price", { offers: { price: "10,5" } }, 10.5],
        ["offers.lowPrice", { offers: { lowPrice: 7 } }, 7],
        ["no price", { offers: {} }, null],
        ["no offers", {}, null],
    ])("extracts the price from %s", (_name, extra, expected) => {
        expect(jsonLd(ld(product(extra)))[0].price.value).toBe(expected)
    })

    it("prefers offers.url, then url", () => {
        expect(jsonLd(ld(product({ offers: { url: "https://o/MLB-9" } })))[0].url).toBe("https://o/MLB-9")
        expect(jsonLd(ld(product()))[0].url).toBe("https://produto.mercadolivre.com.br/MLB-123-produto")
    })

    it.each([
        ["array", ["https://i/1.jpg", "https://i/2.jpg"], "https://i/1.jpg"],
        ["string", "https://i/3.jpg", "https://i/3.jpg"],
        ["missing", undefined, null],
    ])("extracts the thumbnail from a %s image", (_name, image, expected) => {
        expect(jsonLd(ld(product({ image })))[0].thumbnail).toBe(expected)
    })

    it.each([
        ["/MLB id", "https://produto.mercadolivre.com.br/MLB-123", "MLB-123"],
        ["/p/MLB id", "https://www.mercadolivre.com.br/p/MLB456", "MLB456"],
        ["wid parameter", "https://click.mercadolivre.com.br/x?wid=MLB789", "MLB789"],
        ["no id", "https://example.com/produto", null],
    ])("extracts the external id from a %s", (_name, url, expected) => {
        expect(jsonLd(ld(product({ url })))[0].externalId).toBe(expected)
    })

    it.each([
        ["string", "Marca", "Marca"],
        ["object", { name: "Marca" }, "Marca"],
        ["object without name", {}, null],
        ["missing", undefined, null],
    ])("extracts the brand from a %s", (_name, brand, expected) => {
        expect(jsonLd(ld(product({ brand })))[0].brand).toBe(expected)
    })

    it.each([
        ["ratingCount", { ratingValue: "4,5", ratingCount: 10, reviewCount: 99 }, { average: 4.5, totalReviews: 10 }],
        ["reviewCount", { ratingValue: 4, reviewCount: "7" }, { average: 4, totalReviews: 7 }],
        ["no counts", { ratingValue: 4 }, { average: 4, totalReviews: null }],
        ["invalid counts", { ratingValue: 4, ratingCount: "x" }, { average: 4, totalReviews: null }],
        ["invalid value", { ratingValue: "x" }, null],
    ])("extracts the rating from %s", (_name, aggregateRating, expected) => {
        expect(jsonLd(ld(product({ aggregateRating })))[0].rating).toEqual(expected)
    })

    it("returns no rating when there is no aggregateRating", () => {
        expect(jsonLd(ld(product()))[0].rating).toBeNull()
    })
})

// ---------------------------------------------------------------------------
// extractFromHtml
// ---------------------------------------------------------------------------

describe("extractFromHtml", () => {
    it("returns an empty list without cards", () => {
        expect(cards("<html></html>")).toEqual([])
    })

    it("extracts a complete card", () => {
        const [item] = cards(
            card({
                title: "<b>Fone</b> Bluetooth",
                current: money(1299, 90),
                previous: money(1999, 5),
                img: "https://i/1.jpg",
                rating: '<span class="polylabel-label">4,8</span><span class="other">(10)</span>',
                seller: "<b>Loja Oficial</b>",
            }),
        )

        expect(item).toEqual({
            marketplace: "mercado_livre",
            externalId: "MLB111",
            title: "Fone Bluetooth",
            url: "https://www.mercadolivre.com.br/produto/p/MLB111?x=1",
            thumbnail: "https://i/1.jpg",
            price: { value: 1299.9, originalValue: 1999.05, currency: "BRL" },
            rating: { average: 4.8, totalReviews: null },
            brand: "Loja Oficial",
            scrapedAt: "now",
        })
    })

    it("respects the limit", () => {
        expect(cards(card() + card() + card(), 2)).toHaveLength(2)
    })

    it("skips cards without a title link or with an empty title", () => {
        expect(cards(card({ href: null }))).toEqual([])
        expect(cards(card({ title: "  " }))).toEqual([])
    })

    it.each([
        [
            "wid parameter",
            "https://click.mercadolivre.com.br/x?a=1&wid=MLB222",
            "MLB222",
            "https://click.mercadolivre.com.br/x?a=1&wid=MLB222",
        ],
        [
            "direct MLB id",
            "https://produto.mercadolivre.com.br/MLB-333",
            "MLB-333",
            "https://produto.mercadolivre.com.br/MLB-333",
        ],
        [
            "tracking url",
            "https://click1.mercadolivre.com.br/x?wid=MLB444",
            "MLB444",
            "https://www.mercadolivre.com.br/p/MLB444",
        ],
        ["no id", "https://example.com/produto", null, "https://example.com/produto"],
    ])("resolves the id and url from a %s", (_name, href, id, url) => {
        const [item] = cards(card({ href: `${href.replace(/&/g, "&amp;")}` }))

        expect(item.externalId).toBe(id)
        expect(item.url).toBe(url)
    })

    it.each([
        ["fraction and cents", money(10, 5), 10.05],
        ["fraction only", money(10), 10],
        ["no fraction", money(null, 5), null],
    ])("parses the current price with %s", (_name, current, expected) => {
        expect(cards(card({ current }))[0].price.value).toBe(expected)
    })

    it("has no price without a current price block", () => {
        expect(cards(card({ current: null }))[0].price.value).toBeNull()
    })

    it.each([
        ["fraction and cents", money(20, 99), 20.99],
        ["fraction only", money(20), 20],
        ["no fraction", money(null, 5), null],
    ])("parses the previous price with %s", (_name, previous, expected) => {
        expect(cards(card({ previous }))[0].price.originalValue).toBe(expected)
    })

    it("has no thumbnail, rating or brand when they are missing", () => {
        const [item] = cards(card())

        expect(item).toMatchObject({ thumbnail: null, rating: null, brand: null })
    })

    it("ignores rating blocks without a label and empty sellers", () => {
        const [item] = cards(card({ rating: "<b>sem nota</b>", seller: "<b> </b>" }))

        expect(item).toMatchObject({ rating: null, brand: null })
    })
})

// ---------------------------------------------------------------------------
// getProduct
// ---------------------------------------------------------------------------

describe("getProduct", () => {
    const URL = "https://produto.mercadolivre.com.br/MLB-123-produto"
    const html = ld({ "@type": "Product", name: "Produto Final" })

    it("loads the page and parses it", async () => {
        const page = makePage({ content: vi.fn().mockResolvedValue(html) })
        useBrowser(page)

        const product = await makeScraper().getProduct({ url: URL })

        expect(product.title).toBe("Produto Final")
        expect(page.goto).toHaveBeenCalledWith(URL, { waitUntil: "networkidle2", timeout: 35000 })
        expect(page.close).toHaveBeenCalled()
    })

    it("works without waitForSelector and when the selector never appears", async () => {
        useBrowser(makePage({ waitForSelector: undefined, content: vi.fn().mockResolvedValue(html) }))
        await expect(makeScraper().getProduct({ url: URL })).resolves.toMatchObject({ title: "Produto Final" })

        useBrowser(
            makePage({
                waitForSelector: vi.fn().mockRejectedValue(new Error("t")),
                content: vi.fn().mockResolvedValue(html),
            }),
        )
        await expect(makeScraper().getProduct({ url: URL })).resolves.toMatchObject({ title: "Produto Final" })
    })

    it("closes the page when navigation fails", async () => {
        const page = makePage({ goto: vi.fn().mockRejectedValue(new Error("boom")) })
        useBrowser(page)

        await expect(makeScraper().getProduct({ url: URL })).rejects.toThrow("boom")
        expect(page.close).toHaveBeenCalled()
    })
})

// ---------------------------------------------------------------------------
// parseProductPage
// ---------------------------------------------------------------------------

describe("parseProductPage", () => {
    const ldProduct = (extra: Record<string, unknown> = {}) => ld({ "@type": "Product", name: "Produto", ...extra })

    it("parses a complete page", () => {
        const html =
            ldProduct({
                description: "Descrição",
                brand: "Marca",
                offers: { price: 99.9, availability: "https://schema.org/InStock" },
                aggregateRating: { ratingValue: 4.7, reviewCount: 30 },
                image: ["https://i/1.jpg", "https://i/1.jpg", "relative.jpg", 5],
            }) +
            `<s class="andes-money-amount--previous">${money(150, 90)}</s>` +
            "em 10x R$ 9,99 Frete grátis meli-full"

        expect(parse(html)).toMatchObject({
            externalId: "MLB-123",
            title: "Produto",
            description: "Descrição",
            brand: "Marca",
            price: { value: 99.9, originalValue: 150.9, installment: { count: 10, value: 9.99 } },
            rating: { average: 4.7, totalReviews: 30 },
            images: ["https://i/1.jpg"],
            thumbnails: ["https://i/1.jpg"],
            shipping: { price: 0, freeShipping: true, full: true },
            availability: { inStock: true },
        })
    })

    it("returns defaults for an empty page", () => {
        expect(parse("<html></html>", "https://example.com/x")).toMatchObject({
            externalId: null,
            title: "Produto Mercado Livre",
            description: null,
            brand: null,
            price: { value: 0, originalValue: null, installment: null },
            rating: { average: 0, totalReviews: null },
            images: [],
            thumbnails: null,
            shipping: { price: null, freeShipping: false, full: false },
            availability: { inStock: true },
        })
    })

    describe("json-ld selection", () => {
        it("finds the product in a @graph", () => {
            const html = ld({ "@graph": [{ "@type": "Organization" }, { "@type": "Product", name: "Do Graph" }] })

            expect(parse(html).title).toBe("Do Graph")
        })

        it("finds the product in a top-level array", () => {
            expect(parse(ld([{ "@type": "Product", name: "Do Array" }])).title).toBe("Do Array")
        })

        it("skips invalid, unrelated and nameless blocks", () => {
            const html =
                `<script type="application/ld+json">not json</script>` +
                ld({ "@graph": [{ "@type": "Organization" }] }) +
                ld({ "@type": "Organization" }) +
                ld({ "@type": "Product" }) +
                ldProduct({ name: "Final" }) +
                ldProduct({ name: "Ignorado" })

            expect(parse(html).title).toBe("Final")
        })
    })

    it.each([
        ["/MLB id in the url", "https://x/MLB-1", "{}", "MLB-1"],
        ["/p/MLB id in the url", "https://x/p/MLB2", "{}", "MLB2"],
        ["wid in the url", "https://x/y?wid=MLB3", "{}", "MLB3"],
        ["sku", "https://x/y", '{"sku":"SKU1"}', "SKU1"],
        ["productID", "https://x/y", '{"productID":"PID1"}', "PID1"],
        ["nothing", "https://x/y", "{}", null],
    ])("resolves the external id from %s", (_name, url, extra, expected) => {
        expect(parse(ldProduct(JSON.parse(extra)), url).externalId).toBe(expected)
    })

    it.each([
        ["h1 ui-pdp-title", '<h1 class="ui-pdp-title"><b>Do</b> H1</h1>', "Do H1"],
        ["plain h1", "<h1><span>Plain</span> H1</h1>", "Plain H1"],
        ["empty h1", '<h1 class="ui-pdp-title"></h1>', "Produto Mercado Livre"],
        ["nothing", "", "Produto Mercado Livre"],
    ])("resolves the title from %s", (_name, html, expected) => {
        expect(parse(html).title).toBe(expected)
    })

    it.each([
        ["json-ld", ldProduct({ description: "JSON" }), "JSON"],
        ["paragraph", '<p class="ui-pdp-description__content">Linha 1<br/>Linha <b>2</b></p>', "Linha 1\nLinha 2"],
        ["nothing", "", null],
    ])("resolves the description from %s", (_name, html, expected) => {
        expect(parse(html).description).toBe(expected)
    })

    it.each([
        ["string", ldProduct({ brand: "Marca" }), "Marca"],
        ["object", ldProduct({ brand: { name: "Objeto" } }), "Objeto"],
        ["table row", "<table><tr><th>Marca</th><td><b>Tabela</b></td></tr></table>", "Tabela"],
        ["object without a name and no table", ldProduct({ brand: {} }), null],
        ["nothing", "", null],
    ])("resolves the brand from %s", (_name, html, expected) => {
        expect(parse(html).brand).toBe(expected)
    })

    it.each([
        ["offers.price", ldProduct({ offers: { price: "10,5" } }), 10.5],
        ["offers.lowPrice", ldProduct({ offers: { lowPrice: 7 } }), 7],
        ["second line with cents", `<div class="ui-pdp-price__second-line">${money(20, 5)}</div>`, 20.05],
        ["second line without cents", `<div class="ui-pdp-price__second-line">${money(20)}</div>`, 20],
        ["second line without a fraction", `<div class="ui-pdp-price__second-line">${money(null, 5)}</div>`, 0],
        [
            "offers without a price",
            ldProduct({ offers: {} }) + `<div class="ui-pdp-price__second-line">${money(30)}</div>`,
            30,
        ],
        ["nothing", "", 0],
    ])("resolves the price from %s", (_name, html, expected) => {
        expect(parse(html).price.value).toBe(expected)
    })

    it.each([
        ["with cents", money(40, 9), 40.09],
        ["without cents", money(40), 40],
        ["without a fraction", money(null, 9), null],
    ])("resolves the previous price %s", (_name, previous, expected) => {
        expect(parse(`<s class="andes-money-amount--previous">${previous}</s>`).price.originalValue).toBe(expected)
    })

    it.each([
        ["valid", "em 3x R$ 10,50", { count: 3, value: 10.5 }],
        ["with 'de'", "em 12x de R$ 5,00", { count: 12, value: 5 }],
        ["zero installments", "em 0x R$ 10,00", null],
        ["unparsable value", "em 3x R$ ,", null],
        ["absent", "sem parcelas", null],
    ])("resolves the installment when %s", (_name, html, expected) => {
        expect(parse(html).price.installment).toEqual(expected)
    })

    it.each([
        [
            "json-ld with reviewCount",
            ldProduct({ aggregateRating: { ratingValue: 4.5, reviewCount: 8, ratingCount: 99 } }),
            4.5,
            8,
        ],
        ["json-ld with ratingCount", ldProduct({ aggregateRating: { ratingValue: "4,2", ratingCount: "5" } }), 4.2, 5],
        ["json-ld without counts", ldProduct({ aggregateRating: { ratingValue: 4 } }), 4, null],
        [
            "html fallback after an invalid json-ld value",
            ldProduct({ aggregateRating: { ratingValue: "x" } }) + '<span class="ui-pdp-review__ratings">3,9</span>',
            3.9,
            null,
        ],
        ["html only", '<span class="ui-pdp-review__ratings">4,1</span>', 4.1, null],
        ["unparsable html", '<span class="ui-pdp-review__ratings">,</span>', 0, null],
        ["nothing", "", 0, null],
    ])("resolves the rating from %s", (_name, html, average, total) => {
        const { rating } = parse(html)

        expect(rating.average).toBe(average)
        expect(rating.totalReviews).toBe(total)
    })

    it.each([
        ["json-ld image string", ldProduct({ image: "https://i/1.jpg" }), ["https://i/1.jpg"]],
        ["json-ld without valid images", ldProduct({ image: ["relative.jpg"] }), []],
        [
            "html gallery",
            '<img class="ui-pdp-gallery__figure__image" src="https://i/2.jpg"><img class="ui-pdp-gallery__figure__image" src="https://i/2.jpg"><img class="ui-pdp-gallery__figure__image" src="relative.jpg">',
            ["https://i/2.jpg"],
        ],
        ["nothing", "", []],
    ])("resolves the images from %s", (_name, html, expected) => {
        expect(parse(html).images).toEqual(expected)
    })

    it.each([
        ["free shipping", "Frete grátis", { freeShipping: true, full: false }],
        ["arrives free", "Chegará grátis amanhã", { freeShipping: true, full: false }],
        ["full", "ui-pdp-icon--full", { freeShipping: false, full: true }],
    ])("detects shipping: %s", (_name, html, expected) => {
        expect(parse(html).shipping).toMatchObject(expected)
    })

    it.each([
        ["out of stock offer", ldProduct({ offers: { availability: "https://schema.org/OutOfStock" } }), false],
        ["in stock offer", ldProduct({ offers: { availability: "https://schema.org/InStock" } }), true],
        ["sold out text", "Produto esgotado", false],
        ["paused text", "Anúncio pausado", false],
        ["no information", "", true],
    ])("detects availability: %s", (_name, html, expected) => {
        expect(parse(html).availability.inStock).toBe(expected)
    })
})
