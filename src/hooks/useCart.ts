import { useState, useMemo } from "react"

export const useCart = () => {
  const [cart, setCart] = useState<any[]>([])

  const addItem = (item: any) => {
    setCart(prev => {
      const exists = prev.find(i => i.id === item.id)

      if (exists) {
        return prev.map(i =>
          i.id === item.id ? { ...i, qty: i.qty + 1 } : i
        )
      }

      return [...prev, { ...item, qty: 1 }]
    })
  }

  const removeItem = (id: number) => {
    setCart(prev =>
      prev
        .map(i =>
          i.id === id ? { ...i, qty: i.qty - 1 } : i
        )
        .filter(i => i.qty > 0)
    )
  }

  const subtotal = useMemo(() => {
    return cart.reduce((sum, i) => sum + i.price * i.qty, 0)
  }, [cart])

  return {
    cart,
    addItem,
    removeItem,
    subtotal
  }
}