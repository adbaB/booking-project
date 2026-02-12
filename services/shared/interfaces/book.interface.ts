export interface IBook {
  isbn: string;
  static_data: {
      title: string;
      author: string;
      url: string;
      publisher: string;
      age: string;
      format: string;
      condition: string;
  };
  price_data: {
      price: number;
      original_price: number;
      discount: number;
      currency: string;
  };
}
