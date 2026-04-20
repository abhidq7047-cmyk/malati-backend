require("dotenv").config();

const express = require("express");
const Razorpay = require("razorpay");
const crypto = require("crypto");
const cors = require("cors");
const Database = require("better-sqlite3");
const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");
const fetch = require("node-fetch");
const cloudinary = require("cloudinary").v2;

const app = express();
app.use(express.json());
app.use(cors());

/* ===============================
   CLOUDINARY CONFIG
=============================== */
cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUD_API_KEY,
  api_secret: process.env.CLOUD_API_SECRET,
});

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
function saveOrder(order) {
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
   GENERATE PDF
=============================== */
function generateInvoice(order) {
  return new Promise((resolve, reject) => {
    const dir = path.join(__dirname, "invoices");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);

    const filePath = path.join(dir, `${order.orderId}.pdf`);
    const doc = new PDFDocument({ margin: 40 });

    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    doc.fontSize(18).text("MALATI FOODS", { align: "center" });
    doc.moveDown();

    doc.fontSize(12)
      .text(`Order ID: ${order.orderId}`)
      .text(`Name: ${order.name}`)
      .text(`Phone: ${order.phone}`)
      .text(`Address: ${order.address}`);

    doc.moveDown();

    let total = 0;

    order.items.forEach(i => {
      const t = i.price * i.qty;
      total += t;
      doc.text(`${i.name} × ${i.qty} = ₹${t}`);
    });

    doc.moveDown();
    doc.text(`Total: ₹${total}`);

    doc.end();

    stream.on("finish", () => resolve(filePath));
    stream.on("error", reject);
  });
}

/* ===============================
   UPLOAD TO CLOUDINARY
=============================== */
async function uploadToCloudinary(filePath) {
  const result = await cloudinary.uploader.upload(filePath, {
    resource_type: "raw",
    folder: "malati_invoices",
  });

  return result.secure_url; // ✅ IMPORTANT
}

/* ===============================
   RAZORPAY
=============================== */
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

/* ===============================
   CREATE ORDER
=============================== */
app.post("/create-order", async (req, res) => {
  const { amount } = req.body;

  const order = await razorpay.orders.create({
    amount: amount * 100,
    currency: "INR",
  });

  res.json(order);
});

/* ===============================
   VERIFY PAYMENT
=============================== */
app.post("/verify-payment", async (req, res) => {
  try {
    console.log("🔥 VERIFY PAYMENT HIT");

    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      cart,
      customer,
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
    const total = cart.reduce((sum, i) => sum + i.price * i.qty, 0);

    const orderData = {
      orderId,
      name: customer.name,
      phone: customer.phone,
      address: customer.address,
      items: cart,
      total,
      paymentId: razorpay_payment_id,
      status: "Processing",
    };

    // SAVE
    saveOrder(orderData);
    console.log("✅ Order saved");

    // GENERATE PDF
    const filePath = await generateInvoice(orderData);
    console.log("📄 PDF generated:", filePath);

    // UPLOAD
    const cloudinaryUrl = await uploadToCloudinary(filePath);
    console.log("☁️ Cloudinary URL:", cloudinaryUrl);

    // SEND TO N8N
    await fetch(process.env.N8N_WEBHOOK, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        orderId,
        phone: "91" + customer.phone,
        invoiceUrl: cloudinaryUrl,
      }),
    });

    console.log("🚀 Sent to n8n");

    res.json({ status: "success" });

  } catch (err) {
    console.error("❌ ERROR:", err);
    res.status(500).json({ status: "error" });
  }
});

/* ===============================
   START
=============================== */
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});