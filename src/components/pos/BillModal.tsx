import { useEffect, useRef } from "react"
import { QRCodeCanvas } from "qrcode.react"
import type { Order, OutletInfo } from "@/types/pos"

interface Props {
  order: Order | null
  outlet: OutletInfo
  isOpen: boolean
  onClose: () => void
}

// ── Sound: plays a pleasant chime using Web Audio API ─────────────────────────
function playOrderSound() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    const notes = [523, 659, 784, 1047] // C5 E5 G5 C6
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.frequency.value = freq
      osc.type = "sine"
      gain.gain.setValueAtTime(0.3, ctx.currentTime + i * 0.15)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.15 + 0.4)
      osc.start(ctx.currentTime + i * 0.15)
      osc.stop(ctx.currentTime + i * 0.15 + 0.4)
    })
  } catch (e) {
    console.warn("Audio not available", e)
  }
}

// ── Push notification ─────────────────────────────────────────────────────────
function sendNotification(orderNo: number, total: number) {
  if (!("Notification" in window)) return
  if (Notification.permission === "granted") {
    new Notification("✅ Order Placed!", {
      body: `Order #${orderNo} · ₹${total.toFixed(0)} — being prepared`,
      icon: "/favicon.ico",
      badge: "/favicon.ico",
      tag: `order-${orderNo}`,
      requireInteraction: false,
    })
  } else if (Notification.permission !== "denied") {
    Notification.requestPermission().then(p => {
      if (p === "granted") sendNotification(orderNo, total)
    })
  }
}

export function BillModal({ order, outlet, isOpen, onClose }: Props) {
  const printRef = useRef<HTMLDivElement>(null)
  const orderUrl = order ? `${window.location.origin}/order/${order.id}` : ""

  // Play sound + send notification when modal opens
  useEffect(() => {
    if (isOpen && order) {
      playOrderSound()
      sendNotification(order.token_no || order.order_no, order.total)
    }
  }, [isOpen, order])

  if (!isOpen || !order) return null

  function handlePrint() {
    const content = printRef.current?.innerHTML
    if (!content) return
    const win = window.open("", "_blank", "width=400,height=600")
    if (!win) return
    win.document.write(`
      <html><head><title>Bill - ${outlet.name}</title>
      <style>
        body { font-family: monospace; font-size: 13px; padding: 20px; max-width: 300px; margin: 0 auto; }
        .center { text-align: center; }
        .bold { font-weight: bold; }
        .line { border-top: 1px dashed #999; margin: 8px 0; }
        .row { display: flex; justify-content: space-between; margin: 2px 0; }
        .total { font-size: 16px; font-weight: bold; }
        img { display: block; margin: 8px auto; }
        @media print { button { display: none; } }
      </style></head>
      <body>${content}
      <br/><button onclick="window.print()">🖨️ Print</button>
      </body></html>
    `)
    win.document.close()
    setTimeout(() => win.print(), 300)
  }

  const subtotal = order.total / 1.05
  const gst = order.total - subtotal

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={e => e.stopPropagation()}>

        {/* ── Success header ── */}
        <div style={s.successHeader}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>✅</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "white" }}>Order Placed!</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.8)", marginTop: 4 }}>
            Token #{order.token_no || order.order_no}
          </div>
        </div>

        {/* ── Printable bill content ── */}
        <div ref={printRef} style={s.billBody}>

          {/* Header */}
          <div style={{ textAlign: "center", borderBottom: "1px dashed #d1d5db", paddingBottom: 12, marginBottom: 12 }}>
            <div style={{ fontSize: 16, fontWeight: 800 }}>{outlet.name}</div>
            {outlet.address && <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{outlet.address}</div>}
            {outlet.phone && <div style={{ fontSize: 11, color: "#6b7280" }}>{outlet.phone}</div>}
            {outlet.gst_number && <div style={{ fontSize: 11, color: "#6b7280" }}>GSTIN: {outlet.gst_number}</div>}
            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
              Token #{order.token_no || order.order_no} · {new Date(order.created_at).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}
            </div>
          </div>

          {/* Items */}
          <div style={{ marginBottom: 12 }}>
            {order.items.map((item, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                <span style={{ flex: 1 }}>{item.name} <span style={{ color: "#6b7280" }}>×{item.quantity}</span></span>
                <span style={{ fontWeight: 600 }}>₹{(item.price * item.quantity).toFixed(0)}</span>
              </div>
            ))}
          </div>

          {/* Totals */}
          <div style={{ borderTop: "1px dashed #d1d5db", paddingTop: 10, marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#6b7280", marginBottom: 3 }}>
              <span>Subtotal</span><span>₹{subtotal.toFixed(2)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#6b7280", marginBottom: 6 }}>
              <span>GST (5%)</span><span>₹{gst.toFixed(2)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 16, fontWeight: 800 }}>
              <span>Total</span>
              <span style={{ color: "#f97316" }}>₹{order.total.toFixed(2)}</span>
            </div>
            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
              Payment: {order.payment_method || "CASH"}
            </div>
          </div>

          {/* QR code */}
          <div style={{ textAlign: "center", borderTop: "1px dashed #d1d5db", paddingTop: 12 }}>
            <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>Scan to track your order</div>
            <QRCodeCanvas value={orderUrl} size={130} style={{ margin: "0 auto", display: "block" }} />
            <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 6, wordBreak: "break-all" }}>{orderUrl}</div>
          </div>

          <div style={{ textAlign: "center", fontSize: 12, color: "#9ca3af", marginTop: 12 }}>
            Thank you for visiting {outlet.name}! 🙏
          </div>
        </div>

        {/* ── Actions ── */}
        <div style={s.actions}>
          <button style={s.printBtn} onClick={handlePrint}>🖨️ Print Bill</button>
          <button style={s.closeBtn} onClick={onClose}>Done</button>
        </div>

      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
    display: "flex", alignItems: "center", justifyContent: "center",
    zIndex: 1000, padding: 16,
  },
  modal: {
    background: "white", borderRadius: 16, width: "100%", maxWidth: 400,
    maxHeight: "90vh", display: "flex", flexDirection: "column", overflow: "hidden",
    boxShadow: "0 25px 50px rgba(0,0,0,0.3)",
  },
  successHeader: {
    background: "linear-gradient(135deg, #16a34a, #15803d)",
    padding: "24px 20px", textAlign: "center", flexShrink: 0,
  },
  billBody: {
    flex: 1, overflowY: "auto", padding: "16px 20px",
  },
  actions: {
    display: "flex", gap: 10, padding: "12px 20px",
    borderTop: "1px solid #e5e7eb", flexShrink: 0,
  },
  printBtn: {
    flex: 1, height: 44, background: "#f3f4f6", border: "1px solid #e5e7eb",
    borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer",
  },
  closeBtn: {
    flex: 1, height: 44, background: "#111", color: "white",
    border: "none", borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: "pointer",
  },
}
