import { number } from "framer-motion";
export const categories = [
  "All",
  "Coffee",
  "Tea",
  "Pastries",
  "Food",
  "Beverages",
];

export interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  category?: string;
  size?: string
};

export interface OrderItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  category?: string;
  size?: string
  addons?: MenuAddon[]
};

export type OutletInfo = {
  id: string;
  name: string;
  taxRate: number;
  address?: string;
  phone?: string;
};

export enum OrderStatus {
  PLACED = "PLACED",
  PREPARING = "PREPARING",
  READY = "READY",
  COLLECTED = "COLLECTED",
}

export interface Order {
  id: string;
  outlet_id: string;
  order_no: number; 
  status: OrderStatus;
  items: OrderItem[];
  total: number;
  created_at: string | number;
  ready_at?: string | null;
  tableNumber?: number | null;
  rating?: number | null;
}

export type MenuItem = {
  id: string;
  name: string;
  price: number;
  category_id: string;
  available: boolean;
  created_at?: string;
  is_veg: boolean;
  sizes?: MenuItemSize[]
  addons?: MenuAddon[]
};

export type MenuItemSize = {
  label: string
  price: number
}

export type MenuSize = {
  label: string
  price: number
}

export type MenuAddon = {
  name: string
  price: number
}