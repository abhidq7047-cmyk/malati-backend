const puppeteer = require("puppeteer");

async function generateInvoice(data) {

  const html = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8">
    <style>
      body { font-family: Arial; padding: 20px; }
      h1 { color: #0b7a3b; }
      table { width: 100%; border-collapse: collapse; margin-top: 20px; }
      th, td { border: 1px solid #ddd; padding: 8px; }
      th { background: #0b7a3b; color: white; }
    </style>
  </head>
  <body>

    <h1>Malati Foods</h1>
    <p><b>GST:</b> 21ALAPM6780G2Z8</p>
    <p><b>Phone:</b> +91-9040893816</p>

    <h2>Invoice</h2>

    <p><b>Name:</b> ${data.name}</p>
    <p><b>Phone:</b> ${data.phone}</p>
    <p><b>Address:</b> ${data.address}</p>

    <table>
      <tr>
        <th>Item</th>
        <th>Qty</th>
        <th>Price</th>
      </tr>

      ${data.cart.map(i => `
        <tr>
          <td>${i.name}</td>
          <td>${i.qty}</td>
          <td>₹${i.price}</td>
        </tr>
      `).join("")}

    </table>

    <h3>Total: ₹${data.amount}</h3>

  </body>
  </html>
  `;

  const browser = await puppeteer.launch({
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  const page = await browser.newPage();
  await page.setContent(html);

  const pdf = await page.pdf({
    format: "A4"
  });

  await browser.close();

  return pdf;
}

module.exports = generateInvoice;