import { motion } from 'framer-motion';
import { 
  ShoppingBag, 
  ClipboardList, 
  Settings, 
  Store,
  UtensilsCrossed,
  BarChart3
} from 'lucide-react';
import { cn } from '@/lib/utils';

type POSView = 'menu' | 'orders' | 'outlet' | 'manage';

interface POSSidebarProps {
  activeView: POSView;
  onViewChange: (view: POSView) => void;
  outletName: string;
  todayOrdersCount: number;
  todayRevenue: number;
}

const navItems = [
  { id: 'menu' as const, label: 'Menu', icon: UtensilsCrossed },
  { id: 'orders' as const, label: 'Orders', icon: ClipboardList },
  { id: 'manage' as const, label: 'Manage', icon: Settings },
  { id: 'outlet' as const, label: 'Outlet', icon: Store },
];

function POSSidebar({ 
  activeView, 
  onViewChange, 
  outletName,
  todayOrdersCount,
  todayRevenue 
}: POSSidebarProps) {
  return (
    <aside className="w-20 lg:w-64 bg-sidebar flex flex-col h-full border-r border-sidebar-border">
      {/* Logo */}
      <div className="p-4 lg:p-6 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 lg:w-12 lg:h-12 rounded-xl bg-sidebar-primary flex items-center justify-center flex-shrink-0">
            <ShoppingBag className="w-5 h-5 lg:w-6 lg:h-6 text-sidebar-primary-foreground" />
          </div>
          <div className="hidden lg:block">
            <h1 className="font-bold text-sidebar-foreground text-lg truncate">{outletName}</h1>
            <p className="text-sidebar-foreground/60 text-xs">POS System</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 lg:p-4 space-y-2">
        {navItems.map(item => (
          <button
            key={item.id}
            onClick={() => onViewChange(item.id)}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-3 lg:py-3.5 rounded-xl transition-all touch-target relative",
              activeView === item.id
                ? "bg-sidebar-primary text-sidebar-primary-foreground"
                : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            )}
          >
            {activeView === item.id && (
              <motion.div
                layoutId="sidebar-active"
                className="absolute inset-0 bg-sidebar-primary rounded-xl"
                transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
              />
            )}
            <item.icon className="w-5 h-5 lg:w-5 lg:h-5 relative z-10 flex-shrink-0" />
            <span className="hidden lg:block font-medium relative z-10">{item.label}</span>
          </button>
        ))}
      </nav>

      {/* Today's Stats */}
      <div className="p-3 lg:p-4 border-t border-sidebar-border">
        <div className="bg-sidebar-accent rounded-xl p-3 lg:p-4">
          <div className="flex items-center gap-2 mb-2 lg:mb-3">
            <BarChart3 className="w-4 h-4 text-sidebar-foreground/60" />
            <span className="hidden lg:block text-xs font-medium text-sidebar-foreground/60 uppercase tracking-wide">
              Today
            </span>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="hidden lg:block text-sm text-sidebar-foreground/70">Orders</span>
              <span className="text-lg lg:text-xl font-bold text-sidebar-foreground mx-auto lg:mx-0">
                {todayOrdersCount}
              </span>
            </div>
            <div className="hidden lg:flex items-center justify-between">
              <span className="text-sm text-sidebar-foreground/70">Revenue</span>
              <span className="text-lg font-bold text-sidebar-primary">
                ${todayRevenue.toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
export default POSSidebar;
