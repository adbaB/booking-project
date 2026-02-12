import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { SQSEvent, SQSHandler } from "aws-lambda";
import { IBook } from "../shared/interfaces/book.interface.js";

// Inicialización de clientes fuera del handler para reuso
const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient);
const s3Client = new S3Client({});

const TABLE_NAME = process.env.TABLE_BOOKS || "";
const BUCKET_NAME = process.env.BUCKET_NAME || "";

export const ingest: SQSHandler = async (event: SQSEvent) => {
  console.log(`Recibidos ${event.Records.length} mensajes de SQS.`);

  const processingPromises = event.Records.map(async (record) => {
    try {
      // 1. Parsear el cuerpo del mensaje (el libro que envió el scraper)
      const book: IBook = JSON.parse(record.body);
      
      if (!book.isbn) {
        console.error("Mensaje omitido: No tiene ISBN", record.messageId);
        return;
      }

      // 2. Guardar en DynamoDB (Persistencia de metadatos y precios)
      await docClient.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          ...book,
          updatedAt: new Date().toISOString(),
          pk: `BOOK#${book.isbn}`, // Opcional: si usas patrones de Single Table Design
        }
      }));

      // 3. Guardar en S3 (Opcional: como backup o para índices de búsqueda rápidos)
      // Guardamos el JSON individual del libro
      await s3Client.send(new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: `indices/${book.isbn}.json`,
        Body: JSON.stringify(book),
        ContentType: "application/json"
      }));

      console.log(`Libro ${book.isbn} procesado con éxito.`);
    } catch (error) {
      console.error(`Error procesando mensaje ${record.messageId}:`, error);
      // Al lanzar el error, SQS reintentará este mensaje basado en tu Redrive Policy
      throw error; 
    }
  });

  // Esperar a que todos los mensajes del lote se procesen
  await Promise.all(processingPromises);
};