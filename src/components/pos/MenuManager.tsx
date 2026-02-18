import { useState } from "react";
import { MenuItem } from "@/types/pos";
import { Plus, Pencil, Trash2, X, Check } from "lucide-react";

interface MenuManagerProps {
  menu: MenuItem[];
  onAddItem: (item: Omit<MenuItem, "id">) => void;
  onUpdateItem: (id: string, updates: Partial<MenuItem>) => void;
  onDeleteItem: (id: string) => void;
}

interface ItemFormData {
  name: string;
  price: string;
  category: string;
  description: string;
  available: boolean;
}

const initialFormData: ItemFormData = {
  name: "",
  price: "",
  category: "Coffee",
  description: "",
  available: true,
};

export function MenuManager({
  menu,
  onAddItem,
  onUpdateItem,
  onDeleteItem,
}: MenuManagerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [formData, setFormData] = useState<ItemFormData>(initialFormData);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const categories = [...new Set(menu.map(i => i.category))];

  const openAdd = () => {
    setEditingItem(null);
    setFormData(initialFormData);
    setIsOpen(true);
  };

  const openEdit = (item: MenuItem) => {
    setEditingItem(item);
    setFormData({
      name: item.name,
      price: item.price.toString(),
      category: item.category,
      description: item.description || "",
      available: item.available,
    });
    setIsOpen(true);
  };

  const handleSubmit = () => {
    const parsedPrice = Number(formData.price);
    if (!formData.name.trim() || parsedPrice <= 0) return;

    const data = {
      name: formData.name.trim(),
      price: parsedPrice,
      category: formData.category,
      description: formData.description.trim(),
      available: formData.available,
    };

    if (editingItem) {
      onUpdateItem(editingItem.id, data);
    } else {
      onAddItem(data);
    }

    setIsOpen(false);
    setFormData(initialFormData);
    setEditingItem(null);
  };

  return (
    <div className="space-y-6">

      {/* HEADER */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Menu Items</h2>
          <p className="text-gray-500">{menu.length} items total</p>
        </div>

        <button
          onClick={openAdd}
          className="flex items-center gap-2 bg-black text-white px-4 py-2 rounded-lg"
        >
          <Plus size={16} />
          Add Item
        </button>
      </div>

      {/* MENU LIST */}
      <div className="space-y-4">
        {menu.map(item => (
          <div
            key={item.id}
            className={`flex justify-between items-center border p-4 rounded-lg ${
              !item.available ? "opacity-50" : ""
            }`}
          >
            <div>
              <h4 className="font-semibold">{item.name}</h4>
              <p className="text-sm text-gray-500">
                ₹{item.price.toFixed(2)}
              </p>
            </div>

            <div className="flex gap-3 items-center">
              <button
                onClick={() => openEdit(item)}
                className="text-blue-600"
              >
                <Pencil size={16} />
              </button>

              {deleteConfirm === item.id ? (
                <div className="flex gap-2">
                  <button
                    onClick={() => setDeleteConfirm(null)}
                    className="text-gray-500"
                  >
                    <X size={16} />
                  </button>

                  <button
                    onClick={() => {
                      onDeleteItem(item.id);
                      setDeleteConfirm(null);
                    }}
                    className="text-red-600"
                  >
                    <Check size={16} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setDeleteConfirm(item.id)}
                  className="text-red-600"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* SIMPLE MODAL */}
      {isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center">
          <div className="bg-white p-6 rounded-lg w-96 space-y-4">
            <h3 className="text-lg font-semibold">
              {editingItem ? "Edit Item" : "Add Item"}
            </h3>

            <input
              placeholder="Item Name"
              value={formData.name}
              onChange={e =>
                setFormData({ ...formData, name: e.target.value })
              }
              className="w-full border px-3 py-2 rounded"
            />

            <input
              type="number"
              placeholder="Price"
              value={formData.price}
              onChange={e =>
                setFormData({ ...formData, price: e.target.value })
              }
              className="w-full border px-3 py-2 rounded"
            />

            <select
              value={formData.category}
              onChange={e =>
                setFormData({ ...formData, category: e.target.value })
              }
              className="w-full border px-3 py-2 rounded"
            >
              {categories.map(cat => (
                <option key={cat}>{cat}</option>
              ))}
            </select>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setIsOpen(false)}
                className="px-4 py-2 border rounded"
              >
                Cancel
              </button>

              <button
                onClick={handleSubmit}
                className="px-4 py-2 bg-black text-white rounded"
              >
                {editingItem ? "Save" : "Add"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
