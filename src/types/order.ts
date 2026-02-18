export type Order = {
  id: string;
  items: any[];
  subtotal: number;
  tax: number;
  total: number;
  status: "PLACED" | "READY";
};
