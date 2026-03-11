export function printReceipt(order: any) {

  const itemsHtml = order.items.map((i:any) => `
    <tr>
      <td>${i.name}</td>
      <td>${i.quantity}</td>
      <td>₹${i.price * i.quantity}</td>
    </tr>
  `).join("")

  const html = `
    <html>
      <head>
        <title>Receipt</title>
        <style>
          body {
            font-family: monospace;
            width: 280px;
            margin: auto;
          }
          h2 {
            text-align:center;
          }
          table {
            width:100%;
            border-collapse:collapse;
          }
          td {
            padding:4px 0;
          }
          .total {
            font-weight:bold;
            border-top:1px dashed black;
            margin-top:6px;
          }
        </style>
      </head>
      <body>

        <h2>PAHADI MOMOS</h2>

        <p>Order #${order.order_no}</p>

        <table>
          ${itemsHtml}
        </table>

        <div class="total">
          Total: ₹${order.total}
        </div>

        <p>Payment: ${order.payment_method}</p>

      </body>
    </html>
  `

  const printWindow = window.open("", "_blank")

  if (printWindow) {
    printWindow.document.write(html)
    printWindow.document.close()
    printWindow.print()
  }
}