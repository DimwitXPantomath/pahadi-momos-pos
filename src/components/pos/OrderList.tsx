import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Order, OrderStatus } from '@/types/pos';
import { Clock, ChefHat, CheckCircle2, Package, Timer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Outlet } from "@/types/outlet";



interface OrderListProps {
  orders: Order[];
  onUpdateStatus: (orderId: string, status: OrderStatus) => void;
}

const statusStyle: Record<string, string> = {
  PLACED: "bg-amber-100 text-amber-800",
  PREPARING: "bg-blue-100 text-blue-800",
  READY: "bg-green-100 text-green-800",
};

const statusConfig: Record<OrderStatus, { 
  label: string; 
  icon: React.ReactNode; 
  bgClass: string;
  textClass: string;
  next?: OrderStatus;
  nextLabel?: string;
}> = {
  PLACED: {
    label: 'Placed',
    icon: <Clock className="w-4 h-4" />,
    bgClass: 'bg-status-placed/15',
    textClass: 'text-status-placed',
    next: 'PREPARING',
    nextLabel: 'Start Preparing',
  },
  PREPARING: {
    label: 'Preparing',
    icon: <ChefHat className="w-4 h-4" />,
    bgClass: 'bg-status-preparing/15',
    textClass: 'text-status-preparing',
    next: 'READY',
    nextLabel: 'Mark Ready',
  },
  READY: {
    label: 'Ready',
    icon: <CheckCircle2 className="w-4 h-4" />,
    bgClass: 'bg-status-ready/15',
    textClass: 'text-status-ready',
    next: 'COLLECTED',
    nextLabel: 'Collected',
  },
  COLLECTED: {
    label: 'Collected',
    icon: <Package className="w-4 h-4" />,
    bgClass: 'bg-status-collected/15',
    textClass: 'text-status-collected',
  },
};

function OrderTimer({ createdAt, status }: { createdAt: number; status: OrderStatus }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (status === 'COLLECTED') return;
    
    const update = () => setElapsed(Math.floor((Date.now() - createdAt) / 1000));
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [createdAt, status]);

  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  
  const isUrgent = minutes >= 10 && status !== 'READY' && status !== 'COLLECTED';
  const isWarning = minutes >= 5 && minutes < 10 && status !== 'READY' && status !== 'COLLECTED';

  return (
    <div className={cn(
      "flex items-center gap-1 text-sm font-mono font-semibold",
      isUrgent ? "text-destructive timer-tick" : isWarning ? "text-status-preparing" : "text-muted-foreground"
    )}>
      <Timer className="w-3.5 h-3.5" />
      {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
    </div>
  );
}

export function OrderList({ orders, onUpdateStatus }: OrderListProps) {
  const [filter, setFilter] = useState<OrderStatus | 'ALL'>('ALL');
  
  const filteredOrders = filter === 'ALL' 
    ? orders 
    : orders.filter(o => o.status === filter);
  
  const statusCounts = {
    ALL: orders.length,
    PLACED: orders.filter(o => o.status === 'PLACED').length,
    PREPARING: orders.filter(o => o.status === 'PREPARING').length,
    READY: orders.filter(o => o.status === 'READY').length,
    COLLECTED: orders.filter(o => o.status === 'COLLECTED').length,
  };

  return (
    <div className="flex flex-col h-full">
      {/* Filter Tabs */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
        {(['ALL', 'PLACED', 'PREPARING', 'READY', 'COLLECTED'] as const).map(status => (
          <button
            key={status}
            onClick={() => setFilter(status)}
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-lg font-medium text-sm whitespace-nowrap transition-all touch-target",
              filter === status
                ? status === 'ALL' 
                  ? "bg-primary text-primary-foreground" 
                  : cn(statusConfig[status].bgClass, statusConfig[status].textClass)
                : "bg-card text-muted-foreground hover:bg-accent"
            )}
          >
            {status !== 'ALL' && statusConfig[status].icon}
            {status === 'ALL' ? 'All' : statusConfig[status].label}
            <span
  className={`px-3 py-1 rounded-full text-sm font-semibold ${statusStyle[status]}`}
>
  {status}
</span>

          </button>
        ))}
      </div>

      {/* Orders List */}
      <div className="flex-1 overflow-y-auto space-y-3">
        <AnimatePresence mode="popLayout">
          {filteredOrders.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center h-48 text-muted-foreground"
            >
              <Package className="w-12 h-12 mb-2 opacity-50" />
              <p className="font-medium">No orders</p>
            </motion.div>
          ) : (
            filteredOrders.map((order, index) => {
              const config = statusConfig[order.status];
              return (
                <motion.div
                  key={order.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ delay: index * 0.05 }}
                  className={cn(
                    "bg-card rounded-xl p-4 pos-shadow-sm border border-border/50"
                  )}
                >
                  {/* Order Header */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-foreground text-lg">{order.id}</span>
                      <span className={cn(
                        "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold",
                        config.bgClass, config.textClass,
                        order.status === 'READY' && "status-pulse"
                      )}>
                        {config.icon}
                        {config.label}
                      </span>
                    </div>
                    <OrderTimer
                      createdAt={new Date(order.created_at).getTime()}
                      status={order.status}
                    />
                  </div>

                  {/* Order Items */}
                  <div className="bg-accent/50 rounded-lg p-3 mb-3">
                    {order.items.map((item, i) => (
                      <div key={i} className="flex justify-between text-sm py-1">
                        <span className="text-foreground">
                          <span className="font-semibold">{item.quantity}×</span> {item.name}
                        </span>
                        <span className="text-muted-foreground">${(item.price * item.quantity).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>

                  {/* Order Footer */}
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-lg font-bold text-primary">${order.total.toFixed(2)}</span>
                      {order.tableNumber != null && (
                        <span className="ml-2 text-sm text-muted-foreground">
                          Table {order.tableNumber}
                        </span>
                      )}
                    </div>
                    
                    {config.next && (
                      <Button
                        onClick={() => onUpdateStatus(order.id, config.next!)}
                        size="sm"
                        className={cn(
                          "font-semibold touch-target",
                          order.status === 'PLACED' && "bg-status-preparing hover:bg-status-preparing/90 text-white",
                          order.status === 'PREPARING' && "bg-status-ready hover:bg-status-ready/90 text-white",
                          order.status === 'READY' && "bg-status-collected hover:bg-status-collected/90 text-white"
                        )}
                      >
                        {config.nextLabel}
                      </Button>
                    )}
                    
                    {order.rating && (
                      <div className="flex items-center gap-1">
                        {[1, 2, 3, 4, 5].map(star => (
                          <span
                            key={star}
                            className={star <= order.rating! ? "text-amber-400" : "text-muted"}
                          >
                            ★
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
