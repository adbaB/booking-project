import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { BatchGetCommand, DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";


const bucketName = process.env.BUCKET_NAME || "";
const tableBooks = process.env.TABLE_BOOKS || "";
const lambdaName = process.env.LAMBDA_SCRAPER_WORKER || "";

// Detect SAM Local environment
const isLocal = process.env.AWS_SAM_LOCAL === 'true';
const localEndpoint = process.env.AWS_LAMBDA_ENDPOINT || "http://host.docker.internal:3001";

const lambdaClient = new LambdaClient({
    region: "us-east-2",
    ...(isLocal && { endpoint: localEndpoint })
});

const s3Client = new S3Client({
    region: "us-east-2",
});
const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const STOP_WORDS = new Set([
    "libro",
    "de",
    "la",
    "el",
    "en",
    "y",
    "a",
    "los",
    "las",
    "un",
    "una",
    "unos",
    "unas",
    "con",
    "por",
    "para",
    "del",
    "al",
    "su",
    "sus",
    "o",
    "u",
    "tu",
    "tus",
    "mi",
    "mis",
    "esta",
    "este",
    "esto",
    "estos",
    "estas",
    "aquellos",
    "aquellas",
    "se",
    "lo",
    "que",
    "como",
    "mas",
    "pero",
    "sus",
    "sin",
    "sobre",
    "este",
    "ya",
    "entre",
    "cuando",
    "todo",
    "the",
    "and",
    "for",
    "with",
    "from",
    "that",
    "this",
    "those",
    "these",
    "your",
    "my",
    "his",
    "her",
    "their",
    "our",
    "its",
    "into",
    "about",
    "than",
    "then",
    "them",
    "they",
    "will",
    "shall",
    "can",
    "could",
    "should",
    "would",
    "must",
    "may",
    "might",
    "shall",
    "been",
    "were",
    "was",
    "are",
    "is",
    "am",
    "being",
    "have",
    "has",
    "had",
    "having",
    "not",
    "nor",
    "neither",
    "either",
    "both",
    "each",
    "every",
    "any",
    "all",
    "anywhere",
]);

console.log(tableBooks, "nombre lambda", lambdaName);

const pathIsbn = "isbn/";
const pathletter = "letter/";

const isISBN = (str: string): boolean => {
    // Quita guiones o espacios que el usuario pueda escribir
    const clean = str.replace(/[-\s]/g, "");
    // Valida si son 10 o 13 dígitos numéricos (el 10 puede terminar en X)
    return /^(?:\d{9}[\dX]|\d{13})$/.test(clean);
};

export const getBooks = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    const queryParams = event.queryStringParameters;
    const search = queryParams?.s;

    if (!search) {
        return {
            statusCode: 404,
            body: JSON.stringify({ message: `No se encontro criterios de busqueda` }),
        };
    }
    console.log("Parametro buscado:", search);

    if (isISBN(search)) {
        const cleanIsbn = search.replace(/[-\s]/g, "");

        const suffix = cleanIsbn.slice(-3);

        try {
            const { Body } = await s3Client.send(
                new GetObjectCommand({
                    Bucket: bucketName,
                    Key: `${pathIsbn}${suffix}.json`,
                })
            );
            if (!Body) throw new Error("Body is empty");
            const catalog = JSON.parse(await Body.transformToString());

            const libro = catalog[cleanIsbn];
            if (!libro) {
                // TODO: si el libro no es encontrado enviar busqueda a scraper para buscar en la web
                return {
                    statusCode: 200,
                    body: JSON.stringify({ type: "direct_match", data: [] }),
                };
            }
            const input = {
                RequestItems: {
                    [tableBooks]: {
                        Keys: [{ isbn: String(libro[0]) }],
                    },
                },
            };

            const commandDynamoDbGet = new BatchGetCommand(input);

            const response = await docClient.send(commandDynamoDbGet);

            // TODO si lo consigue validar que la info este actualizada

            // TODO si esta actualizada enviar al cliente

            // TODO Si no esta actualizada buscar en el scraper y esperar su respuesta

            // TODO si no lo consigue enviar al scraper  a buscarla y espera su respuesta

            return {
                statusCode: 200,
                body: JSON.stringify({ type: "direct_match", data: [libro] }),
            };
        } catch (e) {
            console.log(e);
            // Si no está en el índice, podrías mandarlo a la cola de scraping aquí
            return {
                statusCode: 200,
                body: JSON.stringify({ type: "error", data: [] })
            };
        }
    }

    const words = search
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .split(" ")
        .filter((p) => p.length > 2 && !STOP_WORDS.has(p));

    if (words.length === 0) {
        return {
            statusCode: 404,
            body: JSON.stringify({ message: `Lo sentimos no conseguimos tu libro` }),
        };
    }

    const promises = words.map(async (word) => {
        const suffix = word.substring(0, 3);
        try {
            const { Body } = await s3Client.send(
                new GetObjectCommand({
                    Bucket: bucketName,
                    Key: pathletter + `${suffix}.json`,
                })
            );

            if (!Body) return [];
            const content = await Body.transformToString();
            const index = JSON.parse(content);
            return index[word] || [];
        } catch (error) {
            console.log(error);
            return [];
        }
    });

    const resultForWords = await Promise.all(promises);

    // 2. INTERSECCIÓN SEGURA
    // Ordenamos por longitud para que la intersección sea más rápida (empezar por el array más pequeño)
    resultForWords.sort((a, b) => a.length - b.length);

    let finalMatch = resultForWords.reduce((a, b) => {
        if (a.length === 0) return []; // Si ya está vacío, no hay nada que intersectar
        const setB = new Set(b); // Set es O(1) para búsquedas .has()
        return a.filter((isbn: string) => setB.has(isbn));
    });

    // TODO  buscar en Dynamo db los isbn

    // crear estructures de input  [{ isbn: isbn1 },{ isbn: isbn2 } ... ]
    const isbnInput = finalMatch.slice(0, 50).map((isbn: string) => {
        return {
            isbn: String(isbn),
        };
    });

    const input = {
        RequestItems: {
            [tableBooks]: {
                Keys: isbnInput,
            },
        },
    };

    try {
        const commandDynamoDbGet = new BatchGetCommand(input);

        const response = await docClient.send(commandDynamoDbGet);
        const dbData = response.Responses?.[tableBooks];

        // TODO validar si consigue la informacion
        if (Array.isArray(dbData) && dbData.length <= 0) {
            console.log('entrando a invokar la lambda')
            // TODO si no lo consigue enviar al scraper  a buscarla y espera su respuesta
            const payload = JSON.stringify({
                s: search
            })
            const invoke = new InvokeCommand({
                FunctionName: lambdaName,
                InvocationType: 'RequestResponse',
                Payload: new TextEncoder().encode(payload)
            })
            // crear topic para enviar al scraper
            const response = await lambdaClient.send(invoke)
            const responsePayload = new TextDecoder().decode(response.Payload);
            const scraperResult = JSON.parse(responsePayload);
            console.log(scraperResult)
        }
        console.log(dbData);
        // TODO si lo consigue validar que la info este actualizada

        // TODO si esta actualizada enviar al cliente

        // TODO Si no esta actualizada buscar en el scraper y esperar su respuesta

        return {
            statusCode: 200,
            body: JSON.stringify({
                type: "search_match",
                total_found: finalMatch.length,
                isbns: finalMatch.slice(0, 50), // Limitamos a los primeros 50
            }),
        };

    } catch (error) {
        console.error(error);
        return {
            statusCode: 500,
            body: JSON.stringify({ message: "Internal Server Error" })
        }
    }
};
