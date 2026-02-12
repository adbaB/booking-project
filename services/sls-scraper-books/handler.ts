// Encargado de buscar libros desactualizados y libros no encontrados
import { SQSClient, SendMessageBatchCommand } from "@aws-sdk/client-sqs";
import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";
import { Context, Handler } from "aws-lambda";
import axios from "axios";
import axiosRetry from "axios-retry";
import cheerio from "cheerio";
import { IBook } from "./interface/book.interface";

let initializationPromise: Promise<void> | null = null;

// 1. Objeto de caché que persistirá entre ejecuciones
const cacheSecret: Record<string, string> = {};

interface SecretConfig {
  name: string;
  encrypt: boolean;
}

interface ScrapeEvent {
  s: string
}

interface LambdaResult {
  statusCode: number;
  body: string;
}

const ssmClient = new SSMClient({ region: "us-east-2" });
const sqsClient = new SQSClient({ region: "us-east-2" });


const PARAM_KEYS = {
  host: process.env.SCRAPER_HOST || "",
  port: process.env.SCRAPER_PORT || "",
  user: process.env.SCRAPER_USERNAME || "",
  pass: process.env.SCRAPER_PASSWORD || "",
};

const SQS_QUEUE_URL = process.env.SQS_URL || "";

const chunkArray = (array: any[], size: number) => {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
};



const sendBooksToQueue = async (books: IBook[]) => {
  if (books.length === 0) return;

  const chunks = chunkArray(books, 10);

  for (const chunk of chunks) {
    const entries = chunk.map((book, index) => ({
      Id: `book_${book.isbn || index}_${Date.now()}`,
      MessageBody: JSON.stringify(book),
      MessageAttributes: {
        "Topic": { DataType: "String", StringValue: "BookUpdate" },
        "Source": { DataType: "String", StringValue: "BuscaLibre-Scraper" }
      }
    }));

    const command = new SendMessageBatchCommand({
      QueueUrl: SQS_QUEUE_URL,
      Entries: entries,
    });

    try {
      await sqsClient.send(command);
      console.log(`Enviado lote de ${chunk.length} libros a SQS`);
    } catch (err) {
      console.error("Error enviando lote a SQS:", err);
    }
  }
};


axiosRetry(axios, { retries: 3 });
/**
 * Función que carga múltiples secretos en paralelo
 */
const initializeSecrets = async (): Promise<void> => {
  console.log("--- Inicializando secretos desde SSM (Cold Start) ---");

  const secretsToFetch: SecretConfig[] = [
    { name: PARAM_KEYS.host, encrypt: false },
    { name: PARAM_KEYS.port, encrypt: false },
    { name: PARAM_KEYS.user, encrypt: true },
    { name: PARAM_KEYS.pass, encrypt: true },
    // { name: sqsName, encrypt: false },
  ].filter(item => item.name !== "");

  if (secretsToFetch.length === 0) return;

  try {
    await Promise.all(
      secretsToFetch.map(async (item) => {
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
    throw new Error('Failed to initialize credentials'); // Es mejor fallar el inicio que correr sin credenciales
  }
};




const parseNumeric = (str: string): number => {
  if (!str) return 0;
  const numericString = str.replace(/[^\d]/g, "");
  return numericString ? parseInt(numericString, 10) : 0;
};

const getBooksFromSource = async (searchQuery: string): Promise<IBook[]> => {
  const client = axios.create();
  axiosRetry(client, { retries: 3, retryCondition: (error) => error.response?.status === 429 });

  const response = await axios.get("https://www.buscalibre.com.co/libros/search/", {
    // Definición de parámetros de búsqueda
    params: {
      q: searchQuery,
    },
    // Configuración del Proxy
    proxy: {
      protocol: "http",
      host: cacheSecret[PARAM_KEYS.host],
      port: parseInt(cacheSecret[PARAM_KEYS.port]),
      auth: {
        username: cacheSecret[PARAM_KEYS.user],
        password: cacheSecret[PARAM_KEYS.pass],
      },
    },
    timeout: 10000
  });
  console.log(response.data);

  
  const $ = cheerio.load(response.data);
  const books: IBook[] = [];


  $(".producto").each((_, elem) => {
    const $el = $(elem);
    
   
    const metaParts = $el.find(".autor.metas").text().trim().split(",").map(p => p.trim());
    

  
    const meta = {
      publisher: metaParts[0] || "",
      age: metaParts[1] || "",
      format: metaParts.length > 4 ? metaParts[3] : metaParts[2],
      condition: metaParts.length > 4 ? metaParts[4] : metaParts[3]
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

  console.dir(books, { depth: null });

  return books;
}

export const scrapeBooks: Handler<ScrapeEvent, LambdaResult | IBook[]> = async (
  event: ScrapeEvent,
  context: Context
) => {

  
  try {
    
    if (!initializationPromise) {
      initializationPromise = initializeSecrets();
    }
    
    await initializationPromise;
    
    if (!event.s) {
      return { statusCode: 400, body: JSON.stringify({ message: "Missing search parameter 's'" }) };
    }

    const books = await getBooksFromSource(event.s);

    if (books.length > 0) {
      await sendBooksToQueue(books);
    } else {
      console.log("No se encontraron libros para enviar a SQS.");
    }

    return {
      statusCode: 200,
      body: JSON.stringify(books),
    };

  } catch (error:any) {

    console.error("Scraping Error:", error.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Internal Server Error", details: error.message }),
    };
  }
};
