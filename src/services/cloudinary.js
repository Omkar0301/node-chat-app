const cloudinary = require("cloudinary").v2;
const fs = require("fs");
const path = require("path");

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Upload file to Cloudinary
const uploadToCloudinary = async (filePath, folder = "message-attachments") => {
  try {
    if (!filePath) {
      throw new Error("File path is required");
    }

    if (!fs.existsSync(filePath)) {
      throw new Error("File does not exist: " + filePath);
    }

    // Get file extension to determine resource type
    const ext = path.extname(filePath).toLowerCase();
    const isImage = [".jpg", ".jpeg", ".png", ".gif", ".webp"].includes(ext);
    const isVideo = [".mp4", ".webm", ".mov", ".avi"].includes(ext);

    const uploadOptions = {
      folder,
      resource_type: isImage ? "image" : isVideo ? "video" : "raw",
      use_filename: true,
      unique_filename: false,
      overwrite: false,
    };

    const result = await cloudinary.uploader.upload(filePath, uploadOptions);

    return result;
  } catch (error) {
    console.error("Cloudinary upload error:", error);
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
