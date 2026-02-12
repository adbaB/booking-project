import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { BatchGetCommand, DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { IBook } from "../../../shared/interfaces/book.interface";
import { config } from "../config/index";

export class DynamoService {
    private docClient: DynamoDBDocumentClient;

    constructor() {
        const client = new DynamoDBClient({ region: config.region });
        this.docClient = DynamoDBDocumentClient.from(client);
    }

    async getBooksByIsbns(isbns: string[]): Promise<IBook[]> {
        if (isbns.length === 0) return [];

        const uniqueIsbns = [...new Set(isbns)];
        const keys = uniqueIsbns.map(isbn => ({ isbn }));

        // DynamoDB BatchGetItem limit is 100, assuming we handle batches if needed
        // For now, simple implementation
        const input = {
            RequestItems: {
                [config.tableBooks]: {
                    Keys: keys,
                },
            },
        };

        try {
            const command = new BatchGetCommand(input);
            const response = await this.docClient.send(command);
            return (response.Responses?.[config.tableBooks] as IBook[]) || [];
        } catch (error) {
            console.error("Error fetching books from DynamoDB:", error);
            return [];
        }
    }
}
