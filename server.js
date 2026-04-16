require("dotenv").config();

const express = require("express");
const Razorpay = require("razorpay");
const crypto = require("crypto");
const cors = require("cors");
const nodemailer = require("nodemailer");
const Database = require("better-sqlite3"); // 🔥 FIXED
const PDFDocument = require("pdfkit");
const fs = require("fs");
const twilio = require("twilio");

const app = express();
app.use(express.json());
app.use(cors());

/* ===============================
   STATIC INVOICE
=============================== */
app.use("/invoices", express.static("invoices"));

/* ===============================
   DATABASE (FIXED)
=============================== */
const db = new Database("malati.db");

// create table
db.prepare(`
  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    orderId TEXT,
    name TEXT,
    phone TEXT,
    address TEXT,
    items TEXT,
    total INTEGER,
    paymentId TEXT,
    status TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`).run();

/* ===============================
   SAVE ORDER (FIXED)
=============================== */
function saveOrder(order){

  const stmt = db.prepare(`
    INSERT INTO orders 
    (orderId, name, phone, address, items, total, paymentId, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    order.orderId,
    order.name,
    order.phone,
    order.address,
    JSON.stringify(order.items),
    order.total,
    order.paymentId,
    order.status
  );
}

/* ===============================
   INVOICE
=============================== */
function generateInvoice(order){

  if (!fs.existsSync("./invoices")){
    fs.mkdirSync("./invoices");
  }

  const filePath = `./invoices/${order.orderId}.pdf`;

  const doc = new PDFDocument();
  doc.pipe(fs.createWriteStream(filePath));

  doc.fontSize(18).text("MALATI FOODS INVOICE");
  doc.moveDown();

  doc.text(`Order ID: ${order.orderId}`);
  doc.text(`Name: ${order.name}`);
  doc.text(`Phone: ${order.phone}`);
  doc.text(`Address: ${order.address}`);

  doc.moveDown();
  doc.text("Items:");

  order.items.forEach(i => {
    doc.text(`${i.name} × ${i.qty} = ₹${i.price * i.qty}`);
  });

  doc.moveDown();
  doc.text(`Total: ₹${order.total}`);

  doc.end();

  return filePath;
}

/* ===============================
   EMAIL
=============================== */
async function sendOrderEmail(order){

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });

  const invoicePath = generateInvoice(order);

  await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to: `${process.env.EMAIL_USER}, ${order.email}`,
    subject: "🧾 Invoice - Malati Foods",
    html: `<p>Order ${order.orderId} confirmed. Total ₹${order.total}</p>`,
    attachments: [
      {
        filename: `${order.orderId}.pdf`,
        path: invoicePath
      }
    ]
  });
}

/* ===============================
   WHATSAPP
=============================== */
const client = twilio(
  process.env.TWILIO_SID,
  process.env.TWILIO_AUTH
);

async function sendWhatsApp(order){

  let itemsText = order.items.map(i =>
    `• ${i.name} × ${i.qty} = ₹${i.price * i.qty}`
  ).join("\n");

  const invoiceLink = `https://malati-backend.onrender.com/invoices/${order.orderId}.pdf`;
  const trackLink = `https://malati-backend.onrender.com/track/${order.orderId}`;

  const message = `
🙏 Thank you for visiting *Malati Food Products*

Your order has been successfully generated and ready for dispatched 🚚

📦 Order No: ${order.orderId}

👤 Name: ${order.name}
📞 Phone: ${order.phone}

📍 Address:
${order.address}

🛒 Items:
${itemsText}

💰 Total: ₹${order.total}

📄 Download Invoice:
${invoiceLink}

📍 Track Order:
${trackLink}
`;

  await client.messages.create({
    from: "whatsapp:+14155238886",
    to: `whatsapp:+91${order.phone}`,
    body: message
  });
}

/* ===============================
   RAZORPAY
=============================== */
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

/* ===============================
   CREATE ORDER
=============================== */
app.post("/create-order", async (req, res) => {
  const { amount } = req.body;

  const order = await razorpay.orders.create({
    amount: amount * 100,
    currency: "INR"
  });

  res.json(order);
});

/* ===============================
   VERIFY PAYMENT
=============================== */
app.post("/verify-payment", async (req, res) => {

  const {
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
    cart,
    customer
  } = req.body;

  const body = razorpay_order_id + "|" + razorpay_payment_id;

  const expectedSignature = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(body)
    .digest("hex");

  if (expectedSignature !== razorpay_signature) {
    return res.json({ status: "failed" });
  }

  const orderId = "MALATI_" + Date.now();
  const total = cart.reduce((sum,i)=>sum+i.price*i.qty,0);

  const orderData = {
    orderId,
    name: customer.name,
    phone: customer.phone,
    address: customer.address,
    email: customer.email,
    items: cart,
    total,
    paymentId: razorpay_payment_id,
    status: "Processing"
  };

  saveOrder(orderData);
  await sendOrderEmail(orderData);
  await sendWhatsApp(orderData);

  res.json({ status: "success" });
});

/* ===============================
   TRACK ORDER
=============================== */
app.get("/track/:orderId", (req, res) => {

  const row = db.prepare(
    `SELECT * FROM orders WHERE orderId = ?`
  ).get(req.params.orderId);

  if(!row){
    return res.send("Order not found");
  }

  res.send(`
    <h2>Order Status</h2>
    <p>Order ID: ${row.orderId}</p>
    <p>Status: ${row.status}</p>
  `);
});

/* ===============================
   UPDATE STATUS
=============================== */
app.post("/update-status", (req, res) => {

  const { orderId, status } = req.body;

  db.prepare(
    `UPDATE orders SET status = ? WHERE orderId = ?`
  ).run(status, orderId);

  res.json({ success: true });
});

/* ===============================
   START
=============================== */
app.listen(5000, () => {
  console.log("🚀 Server running");
});