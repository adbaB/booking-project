import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { config } from "../config/index";

export class S3Service {
    private client: S3Client;

    constructor() {
        this.client = new S3Client({ region: config.region });
    }

    async getIsbnIndex(suffix: string): Promise<Record<string, any> | null> {
        try {
            const { Body } = await this.client.send(
                new GetObjectCommand({
                    Bucket: config.bucketName,
                    Key: `${config.pathIsbn}${suffix}.json`,
                })
            );
            if (!Body) return null;
            return JSON.parse(await Body.transformToString());
        } catch (error) {
            console.error(`Error fetching ISBN index for suffix ${suffix}:`, error);
            return null;
        }
    }

    async getWordIndex(suffix: string): Promise<Record<string, string[]> | null> {
        try {
            const { Body } = await this.client.send(
                new GetObjectCommand({
                    Bucket: config.bucketName,
                    Key: `${config.pathLetter}${suffix}.json`,
                })
            );
            if (!Body) return null;
            return JSON.parse(await Body.transformToString());
        } catch (error) {
            // console.error(`Error fetching word index for suffix ${suffix}:`, error);
            return null;
        }
    }
}
