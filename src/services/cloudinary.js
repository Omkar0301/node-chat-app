const cloudinary = require("cloudinary").v2;
const fs = require("fs");

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Upload file to Cloudinary
const uploadToCloudinary = async (filePath, folder = "chat-app") => {
  try {
    if (!filePath) {
      throw new Error("File path is required");
    }

    if (!fs.existsSync(filePath)) {
      throw new Error("File does not exist: " + filePath);
    }

    const result = await cloudinary.uploader.upload(filePath, {
      folder,
      resource_type: "auto",
    });

    return result;
  } catch (error) {
    throw error;
  }
};

// Extract public ID from Cloudinary URL
const extractPublicId = (url) => {
  if (!url) return null;
  const matches = url.match(/upload\/(?:v\d+\/)?([^.]*)/);
  return matches ? matches[1] : null;
};

// Delete file from Cloudinary
const deleteFromCloudinary = async (publicIdOrUrl) => {
  try {
    if (!publicIdOrUrl) return;

    const publicId = publicIdOrUrl.includes("cloudinary.com")
      ? extractPublicId(publicIdOrUrl)
      : publicIdOrUrl;

    if (!publicId) return;

    const result = await cloudinary.uploader.destroy(publicId);
    return result;
  } catch {
    return null;
  }
};

module.exports = {
  uploadToCloudinary,
  deleteFromCloudinary,
};
