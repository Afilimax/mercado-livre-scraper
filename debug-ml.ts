import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

puppeteer.use(StealthPlugin());

async function debug() {
    const browser = await puppeteer.launch({
        headless: false, // headless FALSO para vermos o que acontece
        args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--window-size=1920,1080",
            "--disable-blink-features=AutomationControlled",
        ],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
    );
    await page.setExtraHTTPHeaders({
        "accept-language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
    });

    const url = "https://lista.mercadolivre.com.br/echo-dot";
    console.log("Navegando para:", url);

    await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });
    await new Promise((r) => setTimeout(r, 3000));

    const finalUrl = page.url();
    console.log("URL final após redirecionamentos:", finalUrl);

    const result: any = await page.evaluate(() => {
        const scripts = document.querySelectorAll('script[type="application/ld+json"]');
        const scriptCount = scripts.length;

        let graphItems = 0;
        let firstItem: any = null;
        let parseErrors: string[] = [];

        scripts.forEach((s, i) => {
            try {
                const parsed = JSON.parse((s as HTMLScriptElement).textContent || "");
                if (parsed["@graph"]) {
                    graphItems = parsed["@graph"].length;
                    firstItem = parsed["@graph"][0] ?? null;
                }
            } catch (e: any) {
                parseErrors.push(`script[${i}]: ${e.message}`);
            }
        });

        const htmlLength = document.documentElement.outerHTML.length;
        const hasProductCards =
            document.querySelectorAll('[class*="poly-card"], [class*="ui-search-result"]').length;

        return {
            scriptCount,
            graphItems,
            firstItem,
            parseErrors,
            htmlLength,
            hasProductCards,
        };
    });

    console.log("\n=== RESULTADO DO DIAGNÓSTICO ===");
    console.log("JSON-LD scripts encontrados:", result.scriptCount);
    console.log("Itens no @graph:", result.graphItems);
    console.log("Cards de produto na DOM:", result.hasProductCards);
    console.log("Tamanho do HTML:", result.htmlLength);
    if (result.parseErrors.length > 0) {
        console.log("Erros de parse:", result.parseErrors);
    }
    if (result.firstItem) {
        console.log("\nPrimeiro item do @graph:");
        console.log(JSON.stringify(result.firstItem, null, 2));
    } else {
        console.log("\nNenhum item encontrado no @graph!");
        // Capturar o HTML para análise
        const html = await page.content();
        const jsonLdMatches = [
            ...html.matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi),
        ];
        console.log(`\nMatchAll encontrou: ${jsonLdMatches.length} tags`);
        for (let i = 0; i < jsonLdMatches.length; i++) {
            const raw = jsonLdMatches[i][1].trim();
            console.log(`\n--- Script[${i}] (primeiros 300 chars) ---`);
            console.log(raw.substring(0, 300));
        }
    }

    await new Promise((r) => setTimeout(r, 5000)); // Manter aberto para visualização
    await browser.close();
}

debug().catch(console.error);
