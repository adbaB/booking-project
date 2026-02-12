export const config = {
  tableName: process.env.TABLE_BOOKS || "",
  bucketName: process.env.BUCKET_NAME || "",
  region: "us-east-2",
  pathIsbn: "isbn/",
  pathLetter: "letter/",
};
