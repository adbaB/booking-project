import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
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

    async putObject(key:string, body: string): Promise<void> {
        try {
            await this.client.send(
                new PutObjectCommand({
                    Bucket: config.bucketName,
                    Key: key,
                    Body: body,
                    ContentType: "application/json",
                })
            );
        } catch (error) {
            console.error(`Error putting object ${key}:`, error);
        }

    }

    async updateIndexFile(prefix: string, newEntries: Set<string>) {
        const key = `${config.pathLetter}${prefix}.json`;
        let currentIndex: Record<string, string[]> = {};
    
        // 1. Intentar descargar el índice actual
        try {
          const response = await this.client.send(new GetObjectCommand({
            Bucket: config.bucketName,
            Key: key
          }));
          const body = await response.Body?.transformToString();
          currentIndex = body ? JSON.parse(body) : {};
        } catch (error: any) {
          if (error.name !== "NoSuchKey") {
            console.error(`Error al leer índice ${key}:`, error);
            return; // Si es un error distinto a que no existe, abortamos para no sobrescribir
          }
        }
    
        // 2. Merge de datos
        let hasChanged = false;
        newEntries.forEach(entry => {
          const [word, isbn] = entry.split(":");
          if (!currentIndex[word]) {
            currentIndex[word] = [];
          }
          if (!currentIndex[word].includes(isbn)) {
            currentIndex[word].push(isbn);
            hasChanged = true;
          }
        });
    
        // 3. Subir solo si hubo cambios
        if (hasChanged) {
          await this.client.send(new PutObjectCommand({
            Bucket: config.bucketName,
            Key: key,
            Body: JSON.stringify(currentIndex),
            ContentType: "application/json"
          }));
        }
      }
}
