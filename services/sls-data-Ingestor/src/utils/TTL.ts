export const getTTL = (months: number = 6): number => {
  const date = new Date();
  date.setMonth(date.getMonth() + months);
  // Importante: DynamoDB usa SEGUNDOS, no milisegundos
  return Math.floor(date.getTime() / 1000);
};