import fs from "fs";
import path from 'path';
import type { Page } from "playwright";
import { chromium } from "playwright-extra";
import stealth from "puppeteer-extra-plugin-stealth";
import { fileURLToPath } from 'url';

chromium.use(stealth());

// Reconstruir __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Asegurar que la carpeta de destino existe
const outputDir = path.join('E:', 'books');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir);
}

export async function main() {
  const context = await chromium.launchPersistentContext("./user_data", {
    headless: false,
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 720 },
    args: ["--disable-blink-features=AutomationControlled"],
  });

  const page = context.pages()[0] || (await context.newPage());

  try {
    console.log("Navegando a la home para establecer cookies/sesión...");
    await page.goto("https://www.buscalibre.com.co", {
      waitUntil: "domcontentloaded",
    });

    console.log("Esperando 10s para validación manual si es necesario...");
    await page.waitForTimeout(10000);

    console.log("Obteniendo sitemap maestro...");
    const response = await page.goto(
      "https://www.buscalibre.com.co/sitemap/com-co/books.txt"
    );

    if (response?.status() !== 200) {
      console.error(
        `Error obteniendo sitemap maestro: Status ${response?.status()}`
      );
      return;
    }

    const content = await response.text();
    const subSitemaps = content
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("http"));

    console.log(`Se encontraron ${subSitemaps.length} sub-sitemaps.`);

    for (const url of subSitemaps) {
      await getSubSitemap(url, page);
    }

  } catch (error) {
    console.error("Error en proceso principal:", error);
  } finally {
    console.log("Proceso finalizado.");
    // await context.close();
  }
}

async function getSubSitemap(url: string, page: Page) {
  const name =
    url.split("/").at(-1)?.replace(".txt", "") || `file_${Date.now()}`;

  // Evitar descargar lo que ya tenemos
  if (fs.existsSync(`${outputDir}/${name}.json`)) {
    console.log(`Saltando: ${name} (ya existe)`);
    return;
  }

  // Delay aleatorio para imitar comportamiento humano
  const wait = Math.floor(Math.random() * 3000) + 2000;
  await page.waitForTimeout(wait);

  try {
    console.log(`Descargando sub-sitemap: ${url}`);
    const response = await page.goto(url, { waitUntil: "domcontentloaded" });

    if (response?.status() !== 200) {
      console.warn(
        `[!] Status ${response?.status()} en ${url}. Posible bloqueo.`
      );
      return;
    }

    const content = await response.text();
    if (!content) return;

    const books = content
      .split("\n")
      .map((line) => {
        const cleanLine = line.trim();
        if (!cleanLine.includes("buscalibre.com.co")) return null;

        const parts = cleanLine.split("/");
        // Estructura esperada: https://www.buscalibre.com.co/libro-nombre/isbn/p/id
        return {
          name: parts[3] || "unknown",
          isbn: parts[4] || "unknown",
          url: cleanLine,
        };
      })
      .filter((item) => item !== null);

    fs.writeFileSync(`./books/${name}.json`, JSON.stringify(books, null, 2));
    console.log(`✅ Guardado: ${name}.json (${books.length} libros)`);
  } catch (error) {
    console.error(`Error procesando ${url}:`, error);
  }
}


main();
