import { useState } from "react";
import { Coffee, Leaf, Cake, UtensilsCrossed, GlassWater } from "lucide-react";
import { cn } from "../../lib/utils";
import { MenuItem } from "@/types/pos";

type MenuGridProps = {
  menu: MenuItem[];
  onAddToCart: (item: MenuItem) => void;
};

const categoryIcons: Record<string, React.ReactNode> = {
  Coffee: <Coffee className="w-4 h-4" />,
  Tea: <Leaf className="w-4 h-4" />,
  Pastries: <Cake className="w-4 h-4" />,
  Food: <UtensilsCrossed className="w-4 h-4" />,
  Beverages: <GlassWater className="w-4 h-4" />,
};

const MenuGrid = ({ menu, onAddToCart }: MenuGridProps) => {
  const [activeCategory, setActiveCategory] = useState("All");

  const categories = [
    "All",
    ...Array.from(new Set(menu.map(item => item.category))),
  ];

  const filteredMenu =
    activeCategory === "All"
      ? menu
      : menu.filter(item => item.category === activeCategory);

  return (
    <div className="flex flex-col h-full">
      {/* Category Tabs */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-2 scrollbar-hide">
        {categories.map(category => (
          <button
            key={category}
            onClick={() => setActiveCategory(category)}
            className={cn(
              "flex items-center gap-2 px-5 py-3 rounded-xl font-semibold text-sm whitespace-nowrap transition-all",
              activeCategory === category
                ? "bg-indigo-600 text-white shadow-md"
                : "bg-white text-gray-700 border hover:bg-gray-100"
            )}
          >
            {category !== "All" && categoryIcons[category]}
            {category}
          </button>
        ))}
      </div>

      {/* Menu Items */}
      <div className="grid gap-3">
        {filteredMenu.map(item => (
          <button
            key={item.id}
            onClick={() => onAddToCart(item)}
            className="w-full text-left bg-gray-50 hover:bg-gray-100 transition rounded-lg p-3 border border-gray-100"
          >
            <div className="font-medium text-gray-800">
              {item.name}
            </div>
            <div className="text-sm text-gray-500 flex justify-between mt-1">
              <span>{item.category}</span>
              <span>₹{item.price}</span>
            </div>
          </button>
        ))}
      </div>

      {filteredMenu.length === 0 && (
        <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
          <Coffee className="w-12 h-12 mb-2 opacity-50" />
          <p>No items in this category</p>
        </div>
      )}
    </div>
  );
};

export default MenuGrid;
