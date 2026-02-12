import { IBook } from "./book.interface";

export interface IBookDB extends IBook {
  pk: string;
  purge_at: number;
  updated_at: number;
  expire_at: number;
}
