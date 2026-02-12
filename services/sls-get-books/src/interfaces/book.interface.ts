import { IBook } from "../../../shared/interfaces/book.interface";

export interface SearchResponse {
    type: "direct_match" | "search_match" | "error";
    total_found?: number;
    data?: IBook[];
    isbns?: string[];
    message?: string;
}
