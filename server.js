require("dotenv").config();

const express = require("express");
const Razorpay = require("razorpay");
const crypto = require("crypto");
const cors = require("cors");
const nodemailer = require("nodemailer");
const Database = require("better-sqlite3");
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
   DATABASE
=============================== */
const db = new Database("malati.db");

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
   SAVE ORDER
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
   PROFESSIONAL INVOICE
=============================== */
function generateInvoice(order){

  if (!fs.existsSync("./invoices")){
    fs.mkdirSync("./invoices");
  }

  const filePath = `./invoices/${order.orderId}.pdf`;
  const doc = new PDFDocument({ margin: 40 });

  doc.pipe(fs.createWriteStream(filePath));

  const pageWidth = doc.page.width;

  /* LOGO CENTER */
  if (fs.existsSync("./logo.png")) {
    doc.image("./logo.png", pageWidth / 2 - 40, 30, { width: 80 });
  }

  doc.moveDown(4);

  /* BRAND */
  doc
    .fontSize(18)
    .fillColor("#0b7a3b")
    .text("MALATI FOODS", { align: "center" });

  doc
    .fontSize(10)
    .fillColor("black")
    .text("Cuttack, Odisha", { align: "center" })
    .text("Phone: 9348922068", { align: "center" })
    .text("Email: malatifoods@gmail.com", { align: "center" })
    .text("GSTIN: 21ABCDE1234F1Z5", { align: "center" });

  doc.moveDown(2);

  doc.fontSize(16).text("INVOICE", { align: "center" });

  /* BOX */
  const boxTop = doc.y;
  doc.roundedRect(40, boxTop, 520, 90, 5).stroke();

  const date = new Date().toLocaleDateString();

  doc
    .fontSize(10)
    .text(`Invoice No: ${order.orderId}`, 50, boxTop + 10)
    .text(`Date: ${date}`, 50, boxTop + 25)
    .text(`Payment ID: ${order.paymentId}`, 50, boxTop + 40);

  doc
    .text("Bill To:", 300, boxTop + 10)
    .text(order.name, 300, boxTop + 25)
    .text(`Phone: ${order.phone}`, 300, boxTop + 40)
    .text(order.address, 300, boxTop + 55, { width: 200 });

  /* TABLE */
  let tableTop = boxTop + 110;

  doc.rect(40, tableTop, 520, 25).fill("#0b7a3b");

  doc
    .fillColor("white")
    .fontSize(11)
    .text("Item", 50, tableTop + 7)
    .text("Qty", 300, tableTop + 7)
    .text("Price", 360, tableTop + 7)
    .text("Total", 450, tableTop + 7);

  doc.fillColor("black");

  let y = tableTop + 35;
  let subtotal = 0;

  order.items.forEach(item => {
    const itemTotal = item.price * item.qty;
    subtotal += itemTotal;

    doc
      .fontSize(10)
      .text(item.name, 50, y)
      .text(item.qty, 300, y)
      .text(`₹${item.price}`, 360, y)
      .text(`₹${itemTotal}`, 450, y);

    y += 20;
  });

  /* TOTAL */
  const delivery = 0;
  const finalTotal = subtotal + delivery;

  doc.roundedRect(300, y + 10, 260, 90, 5).stroke();

  doc
    .fontSize(11)
    .text(`Subtotal: ₹${subtotal}`, 310, y + 20)
    .text(`Delivery: ₹${delivery}`, 310, y + 40)
    .fontSize(13)
    .fillColor("#0b7a3b")
    .text(`Total: ₹${finalTotal}`, 310, y + 65);

  doc.fillColor("black");

  /* FOOTER */
  doc
    .fontSize(10)
    .fillColor("gray")
    .text("Thank you for shopping with Malati Foods 🙏", 40, 750, {
      align: "center",
      width: 520
    });

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
   WHATSAPP (SANDBOX)
=============================== */
const client = twilio(
  process.env.TWILIO_SID,
  process.env.TWILIO_AUTH
);

async function sendWhatsApp(order){

  const message = `Order ${order.orderId} confirmed. Total ₹${order.total}`;

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
   START
=============================== */
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});