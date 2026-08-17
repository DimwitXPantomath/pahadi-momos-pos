import { parseDbTimestamp } from "@/lib/utils"

// Called as printKOT({ order, items, station }) — order is the full order
// row (for header fields like customer/table/token), items is the
// station-filtered subset of the cart to print on this particular ticket.
// Previously this function's single param was itself named `order` and
// treated the whole { order, items, station } wrapper as the order, so
// order.items happened to work (reading the sibling `items` key) but every
// real order field (order_no, customer_name, token_no, table_id,
// payment_method) silently read as undefined, one level too shallow.
export function printKOT({ order, items: stationItems, station }: { order: any; items: any[]; station?: string }) {

  const items = stationItems.map((i:any) => `
    <div style="display:flex; justify-content:space-between;">
      <span>${i.name}</span>
      <span>x${i.quantity}</span>
    </div>
    ${i.notes ? `<div style="font-size:12px; font-weight:bold; margin:0 0 4px 8px;">↳ ${i.notes}</div>` : ""}
  `).join("")

  const now = order.created_at ? parseDbTimestamp(order.created_at) : new Date()
  const dateStr = now.toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" })
  const timeStr = now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })

  const isDineIn = order.order_type === "DINE_IN"
  const orderTypeLabel = order.order_type === "DINE_IN" ? "Dine-in"
    : order.order_type === "TAKEAWAY" ? "Take-Away"
    : order.order_type === "ON_THE_GO" ? "On the go"
    : null

  const html = `
  <html>
  <head>
  <title>KOT</title>

  <style>
    body{
      font-family: monospace;
      width:280px;
      padding:10px;
    }

    h2{
      text-align:center;
      margin-bottom:8px;
    }

    .divider{
      border-top:1px dashed black;
      margin:8px 0;
    }

    .item{
      margin-bottom:4px;
      font-size:16px;
    }

    .meta{
      font-size:13px;
      margin-bottom:2px;
    }

  </style>

  </head>

  <body>

    <h2>KITCHEN ORDER</h2>
    ${station ? `<div class="meta" style="text-align:center; font-weight:bold; letter-spacing:1px;">${station}</div>` : ""}

    <div class="meta" style="font-weight:bold; font-size:16px;">KOT #${order.token_no ?? "—"}</div>
    <div class="meta">Bill No. ${order.bill_no != null ? String(order.bill_no).padStart(4, "0") : "—"}</div>
    <div class="meta">${dateStr} · ${timeStr}</div>
    ${orderTypeLabel ? `<div class="meta" style="font-weight:bold;">${orderTypeLabel}</div>` : ""}
    ${isDineIn && order.table_id ? `<div class="meta">Table: ${order.table_id}</div>` : ""}
    ${order.customer_name ? `<div class="meta">Customer: ${order.customer_name}</div>` : ""}

    <div class="divider"></div>

    ${items}

    ${order.notes ? `<div class="divider"></div><div style="font-size:13px;"><strong>Instructions:</strong> ${order.notes}</div>` : ""}

    <div class="divider"></div>

    <div>Payment: ${order.payment_method}</div>

  </body>

  </html>
  `

  const win = window.open("", "_blank")

  if(win){
    win.document.write(html)
    win.document.close()
    win.print()
  }
}