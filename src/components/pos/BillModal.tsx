import { QRCodeSVG } from 'qrcode.react';
import { motion } from 'framer-motion';
import { Order, OutletInfo } from '@/types/pos';
import { X, Printer, Share2, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, } from '@/components/ui/dialog';
import type { Outlet } from "@/types/outlet";


interface BillModalProps {
  order: Order | null;
  outlet: OutletInfo;
  isOpen: boolean;
  onClose: () => void;
  orderUrl: string;
}

export function BillModal({ order, outlet, isOpen, onClose, orderUrl }: BillModalProps) {
  if (!order) return null;

  const handlePrint = () => {
    window.print();
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Order ${order.id}`,
          text: `Track your order from ${outlet.name}`,
          url: orderUrl,
        });
      } catch (err) {
        console.log('Share cancelled');
      }
    } else {
      navigator.clipboard.writeText(orderUrl);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden">
        {/* Success Header */}
        <motion.div 
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="bg-status-ready p-6 text-center"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.1, type: "spring", bounce: 0.5 }}
            className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3"
          >
            <CheckCircle className="w-10 h-10 text-white" />
          </motion.div>
          <h2 className="text-xl font-bold text-white">Order Created!</h2>
          <p className="text-white/80">#{order.id}</p>
        </motion.div>

        {/* Bill Content */}
        <div className="p-6">
          {/* Restaurant Info */}
          <div className="text-center border-b border-dashed border-border pb-4 mb-4">
            <h3 className="font-bold text-lg text-foreground">{outlet.name}</h3>
            <p className="text-sm text-muted-foreground">{outlet.address}</p>
            <p className="text-sm text-muted-foreground">{outlet.phone}</p>
          </div>

          {/* Order Details */}
          <div className="space-y-2 mb-4">
            {order.items.map((item, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span className="text-foreground">
                  <span className="font-medium">{item.quantity}×</span> {item.name}
                </span>
                <span className="text-foreground font-medium">
                  ${(item.price * item.quantity).toFixed(2)}
                </span>
              </div>
            ))}
          </div>

          {/* Totals */}
          <div className="border-t border-dashed border-border pt-3 space-y-1 mb-4">
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Subtotal</span>
              <span>${order.subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Tax ({outlet.taxRate}%)</span>
              <span>${order.tax.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-lg font-bold text-foreground pt-2">
              <span>Total</span>
              <span className="text-primary">${order.total.toFixed(2)}</span>
            </div>
          </div>

          {/* QR Code */}
          <div className="bg-accent/50 rounded-xl p-4 flex flex-col items-center mb-4">
            <p className="text-sm font-medium text-muted-foreground mb-3">Scan to track order</p>
            <div className="bg-white p-3 rounded-xl">
              <QRCodeSVG
                value={orderUrl}
                size={140}
                level="M"
                includeMargin={false}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-2 text-center max-w-[200px] truncate">
              {orderUrl}
            </p>
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-3">
            <Button variant="outline" onClick={handlePrint} className="gap-2 touch-target">
              <Printer className="w-4 h-4" />
              Print
            </Button>
            <Button variant="outline" onClick={handleShare} className="gap-2 touch-target">
              <Share2 className="w-4 h-4" />
              Share
            </Button>
          </div>

          <Button 
            onClick={onClose} 
            className="w-full mt-3 touch-target"
          >
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
