const axios = require("axios");

async function sendWhatsApp(customer, amount, pdfUrl) {

  const phone = customer.phone.replace(/\D/g, "");

  const url = `https://graph.facebook.com/v19.0/1029201146951304/messages`;

  const data = {
    messaging_product: "whatsapp",
    to: phone,
    type: "document",
    document: {
      link: pdfUrl,
      filename: "Malati_Invoice.pdf"
    }
  };

  try {
    await axios.post(url, data, {
      headers: {
        Authorization: `Bearer EAANXS5ugXiwBRSztnYEAGbfWFm6A3WbSbd6MR9I9fUvMkN6Xji1ZBReLisW3Prph0bLsmRMn44G5ZBt2fyiriNwbWCZCut1Fk5IoYmf62wRw92H7QmKLTsbfHZBGrHMrnotKXh9wZBQpNY6dPjBPxZB2O2zkYSkQ9ZAmMKOClUPiQ03AHd9SUpx4IQ6835XEGZBLrRCYATkzbRATsVdSv2BW1QWGeYZBAXXqVf0ZAIaFuVkETmUsaNvuLNGwFlQPlmGaateGPZBmccKJmtMBGUY3vRSJVYxdAZDZD`,
        "Content-Type": "application/json"
      }
    });

    console.log("✅ WhatsApp PDF sent");
  } catch (err) {
    console.error("❌ WhatsApp error:", err.response?.data || err.message);
  }
}

module.exports = sendWhatsApp;