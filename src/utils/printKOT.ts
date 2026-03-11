export function printKOT(order: any) {

  const items = order.items.map((i:any) => `
    <div style="display:flex; justify-content:space-between;">
      <span>${i.name}</span>
      <span>x${i.quantity}</span>
    </div>
  `).join("")

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

  </style>

  </head>

  <body>

    <h2>KITCHEN ORDER</h2>

    <div>Order #${order.order_no}</div>
    <div>${new Date().toLocaleTimeString()}</div>

    <div class="divider"></div>

    ${items}

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