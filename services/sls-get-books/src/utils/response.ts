import { APIGatewayProxyResult } from "aws-lambda";

export const successResponse = (body: any): APIGatewayProxyResult => ({
    statusCode: 200,
    body: JSON.stringify(body),
});

export const notFoundResponse = (message: string): APIGatewayProxyResult => ({
    statusCode: 404,
    body: JSON.stringify({ message }),
});

export const errorResponse = (message: string, statusCode = 500): APIGatewayProxyResult => ({
    statusCode,
    body: JSON.stringify({ message, error: "Internal Server Error" }),
});
