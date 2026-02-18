import { useState, useEffect, useCallback } from 'react';
import { MenuItem, CartItem, Order, OutletInfo, OrderStatus, } from '@/types/pos';
import { supabase } from "@/lib/supabase";
import { outlet as DEFAULT_OUTLET } from "@/config/outlet";


const DEFAULT_MENU = [
  { id: "1", name: "Espresso", price: 120 },
  { id: "2", name: "Cappuccino", price: 160 },
  { id: "3", name: "Green Tea", price: 100 },
];

const STORAGE_KEYS = {
  MENU: 'pos_menu',
  ORDERS: 'pos_orders',
  OUTLET: 'pos_outlet',
};

export function usePOS() {
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [outlet, setOutlet] = useState<OutletInfo>(DEFAULT_OUTLET);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Load data from localStorage on mount
  useEffect(() => {
    const savedMenu = localStorage.getItem(STORAGE_KEYS.MENU);
    const savedOrders = localStorage.getItem(STORAGE_KEYS.ORDERS);
    const savedOutlet = localStorage.getItem(STORAGE_KEYS.OUTLET);

    setMenu(savedMenu ? JSON.parse(savedMenu) : DEFAULT_MENU);
    setOrders(savedOrders ? JSON.parse(savedOrders) : []);
    setOutlet(savedOutlet ? JSON.parse(savedOutlet) : DEFAULT_OUTLET);
    setIsLoading(false);
  }, []);

  // Save menu to localStorage
  useEffect(() => {
    if (!isLoading) {
      localStorage.setItem(STORAGE_KEYS.MENU, JSON.stringify(menu));
    }
  }, [menu, isLoading]);

  // Save orders to localStorage
  useEffect(() => {
    if (!isLoading) {
      localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(orders));
    }
  }, [orders, isLoading]);

  // Save outlet to localStorage
  useEffect(() => {
    if (!isLoading) {
      localStorage.setItem(STORAGE_KEYS.OUTLET, JSON.stringify(outlet));
    }
  }, [outlet, isLoading]);

  // Cart operations
  const addToCart = useCallback((item: MenuItem) => {
    setCart(prev => {
      const existing = prev.find(i => i.id === item.id);
      if (existing) {
        return prev.map(i => 
          i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [...prev, { ...item, quantity: 1 }];
    });
  }, []);

  const removeFromCart = useCallback((itemId: string) => {
    setCart(prev => {
      const existing = prev.find(i => i.id === itemId);
      if (existing && existing.quantity > 1) {
        return prev.map(i => 
          i.id === itemId ? { ...i, quantity: i.quantity - 1 } : i
        );
      }
      return prev.filter(i => i.id !== itemId);
    });
  }, []);

  const clearCart = useCallback(() => {
    setCart([]);
  }, []);

  const updateCartQuantity = useCallback((itemId: string, quantity: number) => {
    if (quantity <= 0) {
      setCart(prev => prev.filter(i => i.id !== itemId));
    } else {
      setCart(prev => prev.map(i => 
        i.id === itemId ? { ...i, quantity } : i
      ));
    }
  }, []);

  // Calculate totals
  const cartSubtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const cartTax = cartSubtotal * (outlet.taxRate / 100);
  const cartTotal = cartSubtotal + cartTax;

  // Order operations
  const createOrder = useCallback(
  async (customerName?: string, tableNumber?: string): Promise<Order> => {
    if (cart.length === 0) {
      throw new Error("Cannot create order with empty cart");
    }

    const newOrder: Order = {
      id: crypto.randomUUID(),
      order_no: orders.length + 1,
      items: [...cart],
      total: cartTotal,
      status: "PLACED",
      created_at: new Date().toISOString(),
    };
    
    const { error } = await supabase
      .from("orders")
      .insert(newOrder);

    if (error) {
      console.error("Failed to create order:", error);
      throw error;
    }

    setOrders((prev) => [newOrder, ...prev]);
    setCart([]);

    return newOrder;
  },
  [cart, orders.length, cartTotal]
);


  const updateOrderStatus = useCallback((orderId: string, status: OrderStatus) => {
    setOrders(prev => prev.map(order => 
      order.id === orderId 
        ? { ...order, status, updatedAt: Date.now() } 
        : order
    ));
  }, []);

  const getOrder = useCallback((orderId: string): Order | undefined => {
    return orders.find(o => o.id === orderId);
  }, [orders]);

  const addOrderRating = useCallback((orderId: string, rating: number, feedback?: string) => {
    setOrders(prev => prev.map(order =>
      order.id === orderId
        ? { ...order, rating, feedback, updatedAt: Date.now() }
        : order
    ));
  }, []);

  // Menu operations
  const addMenuItem = useCallback((item: Omit<MenuItem, 'id'>) => {
    const newItem: MenuItem = {
      ...item,
      id: `item-${Date.now()}`,
    };
    setMenu(prev => [...prev, newItem]);
  }, []);

  const updateMenuItem = useCallback((id: string, updates: Partial<MenuItem>) => {
    setMenu(prev => prev.map(item => 
      item.id === id ? { ...item, ...updates } : item
    ));
  }, []);

  const deleteMenuItem = useCallback((id: string) => {
    setMenu(prev => prev.filter(item => item.id !== id));
  }, []);

  // Outlet operations
  const updateOutlet = useCallback((updates: Partial<OutletInfo>) => {
    setOutlet(prev => ({ ...prev, ...updates }));
  }, []);

  // Active orders (not collected)
  const activeOrders = orders.filter(o => o.status !== 'COLLECTED');
  const todayOrders = orders.filter(o => {
    const today = new Date();
    const orderDate = new Date(o.created_at);
    return orderDate.toDateString() === today.toDateString();
  });

  return {
    // State
    menu,
    orders,
    outlet,
    cart,
    isLoading,
    
    // Computed
    cartSubtotal,
    cartTax,
    cartTotal,
    activeOrders,
    todayOrders,

    // Cart actions
    addToCart,
    removeFromCart,
    clearCart,
    updateCartQuantity,

    // Order actions
    createOrder,
    updateOrderStatus,
    getOrder,
    addOrderRating,

    // Menu actions
    addMenuItem,
    updateMenuItem,
    deleteMenuItem,

    // Outlet actions
    updateOutlet,
  };
}

// Hook for customer order page
export function useCustomerOrder(orderId: string | null) {
  const [order, setOrder] = useState<Order | null>(null);
  const [outlet, setOutlet] = useState<OutletInfo>(DEFAULT_OUTLET);
  const [isLoading, setIsLoading] = useState(true);

  // Poll for order updates
  useEffect(() => {
    if (!orderId) {
      setIsLoading(false);
      return;
    }

    const loadOrder = () => {
      const savedOrders = localStorage.getItem(STORAGE_KEYS.ORDERS);
      const savedOutlet = localStorage.getItem(STORAGE_KEYS.OUTLET);
      
      if (savedOrders) {
        const orders: Order[] = JSON.parse(savedOrders);
        const found = orders.find(o => o.id === orderId);
        setOrder(found || null);
      }
      
      if (savedOutlet) {
        setOutlet(JSON.parse(savedOutlet));
      }
      
      setIsLoading(false);
    };

    loadOrder();
    
    // Poll every 2 seconds for updates
    const interval = setInterval(loadOrder, 2000);
    return () => clearInterval(interval);
  }, [orderId]);

  const submitRating = useCallback((rating: number, feedback?: string) => {
    if (!orderId) return;

    const savedOrders = localStorage.getItem(STORAGE_KEYS.ORDERS);
    if (savedOrders) {
      const orders: Order[] = JSON.parse(savedOrders);
      const updated = orders.map(o =>
        o.id === orderId
          ? { ...o, rating, feedback, updatedAt: Date.now() }
          : o
      );
      localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(updated));
      setOrder(prev => prev ? { ...prev, rating, feedback } : null);
    }
  }, [orderId]);

  return { order, outlet, isLoading, submitRating };
}
