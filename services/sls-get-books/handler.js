import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { BatchGetItemCommand, DynamoDBClient } from '@aws-sdk/client-dynamodb'
const s3Client = new S3Client({
  region: "us-east-2",
});
const dynamoDbClient = new DynamoDBClient({
  region: "us-east-2",
})
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
const bucketName = process.env.BUCKET_NAME;
const pathIsbn = "isbn/";
const pathletter = "letter/";

const isISBN = (str) => {
  // Quita guiones o espacios que el usuario pueda escribir
  const clean = str.replace(/[-\s]/g, "");
  // Valida si son 10 o 13 dígitos numéricos (el 10 puede terminar en X)
  return /^(?:\d{9}[\dX]|\d{13})$/.test(clean);
};

export const getBooks = async (event) => {
  const queryParams = event.queryStringParameters;
  const search = queryParams?.s;

  if (!search) {
    return {
      statusCode: 404,
      body: JSON.stringify({ message: `No se encontro criterios de busqueda` }),
    };
  }
  console.log("Paramentro buscado:", search)

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
      const catalog = JSON.parse(await Body.transformToString());



      const libro = catalog[cleanIsbn];

      if (libro) {
        return {
          statusCode: 200,
          body: JSON.stringify({ type: "direct_match", data: [libro] }),
        };
      } else {
        return {
          statusCode: 200,
          body: JSON.stringify({ type: "direct_match", data: [] }),
        };
      }
    } catch (e) {
      // Si no está en el índice, podrías mandarlo a la cola de scraping aquí
      return [];
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
    return a.filter(isbn => setB.has(isbn));
  });

  return {
    statusCode: 200,
    body: JSON.stringify({
      type: "search_match",
      total_found: finalMatch.length,
      isbns: finalMatch.slice(0, 50) // Limitamos a los primeros 50
    }),
  };
};
