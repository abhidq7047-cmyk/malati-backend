const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "abhidq7047@gmail.com",
    pass: "mgijozbcpuckykzt"
  }
});

async function sendMail(pdfBuffer, amount, customer) {

  await transporter.sendMail({
    from: "Malati Foods <abhidq7047@gmail.com>",

    // ✅ YOU ONLY (as you said)
    to: "abhidq7047@gmail.com",

    subject: `🧾 New Order - ₹${amount}`,

    html: `
      <h2>New Order Received 🚀</h2>

      <p><b>Name:</b> ${customer.name}</p>
      <p><b>Phone:</b> ${customer.phone}</p>
      <p><b>Address:</b> ${customer.address}</p>

      <h3>Total: ₹${amount}</h3>

      <p>Invoice attached below 👇</p>
    `,

    attachments: [
      {
        filename: "invoice.pdf",
        content: pdfBuffer
      }
    ]
  });

  console.log("✅ Email sent successfully");
}

module.exports = sendMail;