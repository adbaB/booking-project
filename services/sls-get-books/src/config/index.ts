export const config = {
    bucketName: process.env.BUCKET_NAME || "",
    tableBooks: process.env.TABLE_BOOKS || "",
    lambdaScraperWorker: process.env.LAMBDA_SCRAPER_WORKER || "",
    isLocal: process.env.AWS_SAM_LOCAL === 'true',
    localEndpoint: process.env.AWS_LAMBDA_ENDPOINT || "http://host.docker.internal:3001",
    region: "us-east-2",
    pathIsbn: "isbn/",
    pathLetter: "letter/",
};
