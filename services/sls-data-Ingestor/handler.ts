import { SQSEvent, SQSHandler } from "aws-lambda";

import { IBook } from "../shared/interfaces/book.interface";
import { normalizeSearch, STOP_WORDS } from "../shared/utils/validators";
import { DynamoService } from "./src/services/dynamo.service";
import { S3Service } from "./src/services/s3.service";


const dynamoService = new DynamoService();
const s3Service = new S3Service();

export const ingest: SQSHandler = async (event: SQSEvent) => {
  console.log(`Recibidos ${event.Records.length} mensajes de SQS.`);

  const books = event.Records.map((record) => {
  
      // 1. Parsear el cuerpo del mensaje (el libro que envió el scraper)
      const book: IBook = JSON.parse(record.body);
      
      if (!book.isbn) {
        console.error("Mensaje omitido: No tiene ISBN", record.messageId);
        return null;
      }
      return book

  });


  if (books.length === 0) {
    console.log("No se encontraron libros para procesar.");
    return;
  }

  const filteredBooks = books.filter(book => book != null)

  const promiseDynamo =  handlerDynamo(filteredBooks)

  const promiseS3 = handlerS3(filteredBooks)

  await Promise.all([promiseDynamo, promiseS3])
};

const handlerDynamo = async (books: IBook[]) => {
  const requestBook = dynamoService.createRequestBook(books)

  await dynamoService.PutBooks(requestBook)
}

const handlerS3 = async (books: IBook[]) => {
  const updates = new Map<string, Set<string>>();

  for (const book of books) {
    const title = book.static_data?.title || "";
    // Usamos tu validador de normalización para obtener las palabras clave
    const words = normalizeSearch(title, STOP_WORDS);

    for (const word of words) {
      const prefix = word.substring(0, 3).toLowerCase();
      if (!updates.has(prefix)) {
        updates.set(prefix, new Set());
      }
      // Guardamos la relación palabra:isbn
      updates.get(prefix)?.add(`${word.toLowerCase()}:${book.isbn}`);
    }
  }

  // 2. Ejecutamos las actualizaciones de archivos en paralelo
  const updatePromises = Array.from(updates.entries()).map(([prefix, newEntries]) => 
    s3Service.updateIndexFile(prefix, newEntries)
  );

  await Promise.all(updatePromises);
  console.log(`Índices de S3 actualizados para ${updates.size} prefijos.`);
 
}