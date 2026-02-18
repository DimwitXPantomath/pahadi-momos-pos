import { motion } from 'framer-motion';
import { CartItem } from '@/types/pos';
import { ChefHat, Printer, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, } from '@/components/ui/dialog';
import type { Outlet } from "@/types/outlet";
import type { MenuItem } from "@/types/menu";




interface KOTModalProps {
  items: CartItem[];
  isOpen: boolean;
  onClose: () => void;
  tableNumber?: string;
}

export function KOTModal({ items, isOpen, onClose, tableNumber }: KOTModalProps) {
  const timestamp = new Date().toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const handlePrint = () => {
    window.print();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-sm p-0 overflow-hidden">
        {/* Header */}
        <div className="bg-sidebar p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-sidebar-primary rounded-lg flex items-center justify-center">
              <ChefHat className="w-5 h-5 text-sidebar-primary-foreground" />
            </div>
            <div>
              <h2 className="font-bold text-sidebar-foreground">Kitchen Order</h2>
              <p className="text-xs text-sidebar-foreground/60">{timestamp}</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-sidebar-accent flex items-center justify-center text-sidebar-foreground hover:bg-sidebar-accent/80"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* KOT Content */}
        <div className="p-6">
          {tableNumber && (
            <div className="bg-accent rounded-lg px-4 py-2 mb-4 text-center">
              <span className="text-sm text-muted-foreground">Table</span>
              <p className="text-2xl font-bold text-foreground">{tableNumber}</p>
            </div>
          )}

          {/* Items */}
          <div className="border-2 border-dashed border-border rounded-xl p-4 mb-4">
            <motion.div className="space-y-3">
              {items.map((item, i) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="flex items-start gap-3"
                >
                  <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                    <span className="text-lg font-bold text-primary">{item.quantity}</span>
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-foreground">{item.name}</p>
                    <p className="text-xs text-muted-foreground">{item.category}</p>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          </div>

          <div className="text-center text-sm text-muted-foreground mb-4">
            Total Items: <span className="font-bold text-foreground">{items.reduce((sum, i) => sum + i.quantity, 0)}</span>
          </div>

          {/* Action Buttons */}
          <Button onClick={handlePrint} className="w-full gap-2 touch-target">
            <Printer className="w-4 h-4" />
            Print KOT
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
