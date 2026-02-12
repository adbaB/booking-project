import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { DynamoService } from "./src/services/dynamo.service.js";
import { S3Service } from "./src/services/s3.service.js";
import { ScraperService } from "./src/services/scraper.service.js";
import { errorResponse, notFoundResponse, successResponse } from "./src/utils/response.js";
import { isISBN, normalizeSearch, STOP_WORDS } from "./src/utils/validators.js";

// Initialize Services
const s3Service = new S3Service();
const dynamoService = new DynamoService();
const scraperService = new ScraperService();

export const getBooks = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    const search = event.queryStringParameters?.s;

    if (!search) {
        return notFoundResponse("No se encontro criterios de busqueda");
    }
    console.log("Parametro buscado:", search);

    try {
        // CASE 1: Search by ISBN
        if (isISBN(search)) {
            return await handleIsbnSearch(search);
        }

        // CASE 2: Search by Keywords
        return await handleKeywordSearch(search);

    } catch (error: any) {
        console.error("Handler Error:", error);
        return errorResponse(error.message);
    }
};

const handleIsbnSearch = async (isbn: string): Promise<APIGatewayProxyResult> => {
    const cleanIsbn = isbn.replace(/[-\s]/g, "");
    const suffix = cleanIsbn.slice(-3);

    // 1. Try S3 Index
    const catalog = await s3Service.getIsbnIndex(suffix);
    const libroData = catalog ? catalog[cleanIsbn] : null;

    if (!libroData) {
        // Not in S3, call scraper
        console.log("ISBN not found in S3, looking up via Scraper...");
        const scrapedBooks = await scraperService.searchBooks(isbn);
        return successResponse({ type: "direct_match", data: scrapedBooks });
    }

    // 2. Found in S3, get details from DynamoDB
    const books = await dynamoService.getBooksByIsbns([String(libroData[0])]);

    // 3. Fallback if DynamoDB is missing data (stale index or sync issue)
    if (books.length === 0) {
        console.log("ISBN found in S3 but missing in DynamoDB, calling Scraper...");
        const scrapedBooks = await scraperService.searchBooks(isbn);
        return successResponse({ type: "direct_match", data: scrapedBooks });
    }

    return successResponse({ type: "direct_match", data: books });
};

const handleKeywordSearch = async (search: string): Promise<APIGatewayProxyResult> => {
    const words = normalizeSearch(search, STOP_WORDS);

    if (words.length === 0) {
        return notFoundResponse("Lo sentimos no conseguimos tu libro");
    }

    // 1. Parallel S3 lookups
    const promises = words.map(async (word) => {
        const suffix = word.substring(0, 3);
        const index = await s3Service.getWordIndex(suffix);
        return index ? (index[word] || []) : [];
    });

    const resultForWords = await Promise.all(promises);

    // 2. Intersect results
    // Sort by length to optimize intersection (start with smallest set)
    resultForWords.sort((a, b) => a.length - b.length);

    // If any word returned 0 results, intersection is empty (strict AND)
    if (resultForWords.flat().length === 0 || resultForWords[0].length === 0) {
        console.log("No partial matches in S3 for keywords, calling Scraper...");
        const scrapedBooks = await scraperService.searchBooks(search);
        return successResponse({
            type: "search_match",
            total_found: scrapedBooks.length,
            data: scrapedBooks
        });
    }

    let finalMatch: string[] = [];
    if (resultForWords.length > 0) {
        finalMatch = resultForWords.reduce((a, b) => {
            if (a.length === 0) return [];
            const setB = new Set(b);
            return a.filter((isbn) => setB.has(isbn));
        });
    }

    if (finalMatch.length === 0) {
        console.log("No keyword matches in S3, calling Scraper...");
        const scrapedBooks = await scraperService.searchBooks(search);
        return successResponse({
            type: "search_match",
            total_found: scrapedBooks.length,
            data: scrapedBooks
        });
    }

    // 3. Get details from DynamoDB
    const isbnsToFetch = finalMatch.slice(0, 50);
    const books = await dynamoService.getBooksByIsbns(isbnsToFetch);

    return successResponse({
        type: "search_match",
        total_found: finalMatch.length,
        data: books,
        // isbns: finalMatch.slice(0, 50) // Optional: return ISBNs if needed
    });
};
