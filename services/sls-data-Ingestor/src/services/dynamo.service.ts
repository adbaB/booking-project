import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  BatchWriteCommand,
  BatchWriteCommandInput,
  DynamoDBDocumentClient,
  GetCommand,
  GetCommandInput,
} from "@aws-sdk/lib-dynamodb";
import { IBook } from "../../../shared/interfaces/book.interface";
import { config } from "../config/index";
import { getTTL } from "../utils/TTL";

export class DynamoService {
  private docClient: DynamoDBDocumentClient;

  constructor() {
    const client = new DynamoDBClient({ region: config.region });
    this.docClient = DynamoDBDocumentClient.from(client);
  }

  async getBookByIsbn(isbn: string): Promise<IBook | null> {
    const input: GetCommandInput = {
      Key: {
        isbn,
      },
      TableName: config.tableName,
    };

    try {
      const command = new GetCommand(input);
      const response = await this.docClient.send(command);
      console.log(response.Item);
      return (response.Item as IBook) || null;
    } catch (error) {
      console.error("Error fetching books from DynamoDB:", error);
      return null;
    }
  }

  createRequestBook(books: IBook[]): BatchWriteCommandInput {
    const requestBook = {
      RequestItems: {
        [config.tableName]: books.map((book) => ({
          PutRequest: {
            Item: {
              ...book,
              expire_at: Math.floor(Date.now() / 1000) + 60 * 60 * 48,
              pk: `BOOK#${book.isbn}`,
              purge_at: getTTL(6),
              updated_at: Math.floor(Date.now() / 1000),
            },
          },
        })),
      },
    };
    return requestBook;
  }

  async PutBooks(putRequests: BatchWriteCommandInput) {
    try {
      const command = new BatchWriteCommand(putRequests);

      const result = await this.docClient.send(command);

      // 5. Manejar items no procesados (UnprocessedItems)
      // DynamoDB puede devolver items si hay mucho tráfico (Throttling)
      if (
        result.UnprocessedItems &&
        Object.keys(result.UnprocessedItems).length > 0
      ) {
        console.warn(
          "Algunos libros no se guardaron, SQS reintentará automáticamente."
        );
        // Si lanzas un error aquí, SQS no borrará el mensaje y lo reintentará
        throw new Error("Batch partially failed");
      }
    } catch (error) {
      console.error("Error crítico en BatchWrite:", error);
      throw error; // Reintento de SQS
    }
  }
}
