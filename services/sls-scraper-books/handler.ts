// Encargado de buscar libros desactualizados y libros no encontrados
import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";
import { Context, Handler } from "aws-lambda";
import axios from "axios";
import cheerio from "cheerio";
import { IBook } from "./interface/book.interface";

const host: string = process.env.SCRAPER_HOST || "";
const port: string = process.env.SCRAPER_PORT || "";
const username: string = process.env.SCRAPER_USERNAME || "";
const password: string = process.env.SCRAPER_PASSWORD || "";
const sqsName: string = process.env.SQS_NAME || "";

const ssmClient = new SSMClient({ region: "us-east-2" });

let initializationPromise: Promise<void> | null = null;

// 1. Objeto de caché que persistirá entre ejecuciones
const cacheSecret: Record<string, string> = {};

interface SecretConfig {
  name: string;
  encrypt: boolean;
}

/**
 * Función que carga múltiples secretos en paralelo
 */
const initializeSecrets = async (secretsConfig: SecretConfig[]): Promise<void> => {
  console.log("--- Inicializando secretos desde SSM (Cold Start) ---");

  console.log(secretsConfig);
  try {
    await Promise.all(
      secretsConfig.map(async (item) => {
        const command = new GetParameterCommand({
          Name: item.name,
          WithDecryption: item.encrypt,
        });
        const response = await ssmClient.send(command);
        if (response?.Parameter?.Name && response.Parameter.Value) {
          // Guardamos en el caché usando el nombre del parámetro como llave
          cacheSecret[item.name] = response.Parameter.Value;
        }
      })
    );
  } catch (error) {
    console.error("Error crítico cargando parámetros de SSM:", error);
    throw error; // Es mejor fallar el inicio que correr sin credenciales
  }
};

const parametrosAObtener: SecretConfig[] = [
  { name: host, encrypt: false },
  { name: port, encrypt: false },
  { name: username, encrypt: true },
  { name: password, encrypt: true },
  // { name: sqsName, encrypt: false },
];


const parseNumeric = (str: string): number => {
  if (!str) return 0;
  const numericString = str.replace(/[^\d]/g, "");
  return numericString ? parseInt(numericString, 10) : 0;
};

interface ScrapeEvent {
  s: string
}

interface LambdaResult {
  statusCode: number;
  body: string;
}

export const scrapeBooks: Handler<ScrapeEvent, LambdaResult | IBook[]> = async (
  event: ScrapeEvent,
  context: Context
) => {
  // Implementation for scraping books would go here
  
  try {
    
    if (!initializationPromise) {
      initializationPromise = initializeSecrets(parametrosAObtener);
    }
    
    await initializationPromise;
    
    console.log("Scraping books...", JSON.stringify(event, null, 2));
    const response = await axios.get("https://www.buscalibre.com.co/libros/search/", {
      // Definición de parámetros de búsqueda
      params: {
        q: event.s,
      },
      // Configuración del Proxy
      proxy: {
        protocol: "http",
        host: "brd.superproxy.io",
        port: 33335,
        auth: {
          username: "brd-customer-hl_59fa0404-zone-web_unlocker1",
          password: "z0agfzl8t22u",
        },
      },
    });
    console.log(response.data);

    
    const $ = cheerio.load(response.data);
    const books: IBook[] = [];


    $(".producto").each((_, elem) => {
      const $el = $(elem);
      
     
      const metaText = $el.find(".autor.metas").text().trim();
      const parts = metaText.split(",").map(p => p.trim());

    
      const meta = {
        publisher: parts[0] || "",
        age: parts[1] || "",
        format: parts.length > 4 ? parts[3] : parts[2],
        condition: parts.length > 4 ? parts[4] : parts[3]
      };

      // Construcción del objeto libro
      const book: IBook = {
        isbn: $el.attr("data-isbn") || "",
        static_data: {
          title: $el.find("h3.nombre").text().trim(),
          author: $el.find(".autor:not(.metas)").first().text().trim(),
          url: $el.find("a").first().attr("href") || "",
          ...meta
        },
        price_data: {
          price: parseNumeric($el.find(".box-precios strong").text()),
          original_price: parseNumeric($el.find(".precio-antes del").text()),
          discount: parseNumeric($el.find(".descuento-v2").text()),
          currency: "COP",
        },
      };

      books.push(book);
    });

    console.dir(books, { depth: null }); // Para ver el objeto completo en consola
    return {
      statusCode: 200,
      body: JSON.stringify(books),
    };

  } catch (error) {
    console.error("Error during scraping:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "Internal Server Error" }),
    };
  }
};
