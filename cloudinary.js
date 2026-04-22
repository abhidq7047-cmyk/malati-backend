const cloudinary = require("cloudinary").v2;

cloudinary.config({
  cloud_name: "Root",
  api_key: "226931348847442",
  api_secret: "hUrtENKK1xO6zcDSLOZ4pl37-B8"
});

async function uploadPDF(buffer) {

  return new Promise((resolve, reject) => {

    const stream = cloudinary.uploader.upload_stream(
      {
        resource_type: "raw",
        folder: "invoices"
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result.secure_url);
      }
    );

    stream.end(buffer);
  });
}

module.exports = uploadPDF;