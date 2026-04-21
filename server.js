require("dotenv").config();

const express = require("express");
const Razorpay = require("razorpay");
const crypto = require("crypto");
const cors = require("cors");
const Database = require("better-sqlite3");
const fs = require("fs");
const path = require("path");
const cloudinary = require("cloudinary").v2;

// ✅ IMPORT YOUR FILES
const generateInvoice = require("./invoice"); // puppeteer version
const sendMail = require("./mail");
const sendWhatsApp = require("./whatsapp");
const uploadPDF = require("./cloudinary");

const app = express();
app.use(express.json());
app.use(cors());

/* ===============================
   CLOUDINARY
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
  db.prepare(`
    INSERT INTO orders 
    (orderId, name, phone, address, items, total, paymentId, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
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
   VERIFY PAYMENT (FINAL FLOW)
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

    // 🔐 VERIFY SIGNATURE
    const body = razorpay_order_id + "|" + razorpay_payment_id;

    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return res.json({ status: "failed" });
    }

    // 📦 ORDER DATA
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

    // 💾 SAVE ORDER
    saveOrder(orderData);
    console.log("✅ Order saved");

    // 📄 GENERATE PDF (BUFFER)
    const pdfBuffer = await generateInvoice({
      name: customer.name,
      phone: customer.phone,
      address: customer.address,
      cart: cart,
      amount: total,
    });

    console.log("📄 PDF generated");

    // ☁️ UPLOAD TO CLOUDINARY
    const pdfUrl = await uploadPDF(pdfBuffer);
    console.log("☁️ Uploaded:", pdfUrl);

    // 📧 SEND EMAIL (YOU ONLY)
    await sendMail(pdfBuffer, total, customer);

    // 📲 SEND WHATSAPP (PDF)
    await sendWhatsApp(customer, total, pdfUrl);

    console.log("🚀 FULL FLOW COMPLETED");

    res.json({ status: "success" });

  } catch (err) {
    console.error("❌ ERROR:", err);
    res.status(500).json({ status: "error" });
  }
});

/* ===============================
   START SERVER
=============================== */
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});