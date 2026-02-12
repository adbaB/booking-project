import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { IBook } from "../../../shared/interfaces/book.interface";
import { config } from "../config/index";

export class ScraperService {
    private client: LambdaClient;

    constructor() {
        this.client = new LambdaClient({
            region: config.region,
            ...(config.isLocal && { endpoint: config.localEndpoint }),
        });
    }

    async searchBooks(query: string): Promise<IBook[]> {
        console.log(`Invoking scraper for query: ${query}`);
        const payload = JSON.stringify({ s: query });

        const command = new InvokeCommand({
            FunctionName: config.lambdaScraperWorker,
            InvocationType: 'RequestResponse',
            Payload: new TextEncoder().encode(payload),
        });

        try {
            const response = await this.client.send(command);
            if (!response.Payload) return [];

            const responsePayload = new TextDecoder().decode(response.Payload);
            const result = JSON.parse(responsePayload);

            // Check if result is Lambda Proxy response or direct payload
            if (result.body) {
                return JSON.parse(result.body) as IBook[];
            }
            return result as IBook[];

        } catch (error) {
            console.error("Error invoking scraper lambda:", error);
            return [];
        }
    }
}
