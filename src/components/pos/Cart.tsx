import { motion, AnimatePresence } from 'framer-motion';
import { CartItem, OutletInfo } from '@/types/pos';
import { Minus, Plus, Trash2, ShoppingBag, Receipt, Printer } from 'lucide-react';
import { Button } from "../ui/button";
import { cn } from '@/lib/utils';

interface CartProps {
  items: CartItem[];
  outlet: OutletInfo;
  subtotal: number;
  tax: number;
  total: number;
  onUpdateQuantity: (itemId: string, quantity: number) => void;
  onRemoveItem: (itemId: string) => void;
  onClearCart: () => void;
  onGenerateKOT: () => void;
  onGenerateBill: () => void;
}

function Cart({
  items,
  outlet,
  subtotal,
  tax,
  total,
  onUpdateQuantity,
  onRemoveItem,
  onClearCart,
  onGenerateKOT,
  onGenerateBill,
}: CartProps) {
  const isEmpty = items.length === 0;

  return (
    <div className="flex flex-col h-full bg-white rounded-2xl pos-shadow-lg border border-border/50 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-border bg-accent/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <ShoppingBag className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="font-semibold text-foreground">Current Bill</h2>
              <p className="text-xs text-muted-foreground">{items.length} items</p>
            </div>
          </div>
          {!isEmpty && (
             <Button
                variant="ghost"
                onClick={onClearCart}
                className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10"
                >

              <Trash2 className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Cart Items */}
      <div className="flex-1 overflow-y-auto p-4">
        <AnimatePresence mode="popLayout">
          {isEmpty ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center h-full text-muted-foreground"
            >
              <ShoppingBag className="w-16 h-16 mb-3 opacity-30" />
              <p className="font-medium">Cart is empty</p>
              <p className="text-sm">Tap items to add them</p>
            </motion.div>
          ) : (
            <div className="space-y-3">
              {items.map((item, index) => (
                <motion.div
                  key={item.id}
                  layout
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ delay: index * 0.05 }}
                  className="flex items-center gap-3 p-3 bg-background rounded-xl border border-border/50"
                >
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-foreground truncate">{item.name}</h4>
                    <p className="text-sm text-primary font-semibold">
                      ${item.price.toFixed(2)}
                    </p>
                  </div>
                  
                  {/* Quantity Controls */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onUpdateQuantity(item.id, item.quantity - 1)}
                      className={cn(
                        "w-8 h-8 rounded-lg flex items-center justify-center transition-colors touch-target",
                        item.quantity === 1
                          ? "bg-destructive/10 text-destructive hover:bg-destructive/20"
                          : "bg-accent text-accent-foreground hover:bg-accent/80"
                      )}
                    >
                      {item.quantity === 1 ? <Trash2 className="w-4 h-4" /> : <Minus className="w-4 h-4" />}
                    </button>
                    
                    <span className="w-10 text-center text-lg font-bold text-foreground">
                      {item.quantity}
                    </span>
                    
                    <button
                      onClick={() => onUpdateQuantity(item.id, item.quantity + 1)}
                      className="w-8 h-8 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 flex items-center justify-center transition-colors touch-target"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                  
                  {/* Line Total */}
                  <div className="text-right min-w-[60px]">
                    <p className="font-bold text-foreground">
                      ${(item.price * item.quantity).toFixed(2)}
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </AnimatePresence>
      </div>

      {/* Totals & Actions */}
      {!isEmpty && (
        <div className="p-4 border-t border-border bg-accent/30">
          {/* Totals */}
          <div className="space-y-2 mb-4">
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Subtotal</span>
              <span>${subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Tax ({outlet.taxRate}%)</span>
              <span>${tax.toFixed(2)}</span>
            </div>
            <div className="bg-indigo-50 p-4 rounded-xl mt-3">
            <p className="text-sm text-gray-500">Total</p>
            <p className="text-3xl font-extrabold text-indigo-600">
                ₹{total.toFixed(2)}
            </p>
            </div>

          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-2">
           <Button
                onClick={onGenerateKOT}
                variant="outline"
                className="h-12 font-semibold opacity-80"
                >
              <Printer className="w-4 h-4 mr-2" />
              KOT
            </Button>
            <Button
                onClick={onGenerateBill}
                className="h-14 text-lg font-bold bg-indigo-600 hover:bg-indigo-700"
                >
              <Receipt className="w-4 h-4 mr-2" />
              Bill + QR
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
export default Cart;
