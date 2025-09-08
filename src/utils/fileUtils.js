const fs = require("fs");
const path = require("path");
const { promisify } = require("util");
const { BadRequestError } = require("./errors");

const unlinkAsync = promisify(fs.unlink);
const mkdirAsync = promisify(fs.mkdir);
const existsAsync = promisify(fs.exists);

// Ensure upload directory exists
const ensureUploadsDir = async () => {
  const uploadDir = path.join(process.cwd(), "uploads");

  try {
    const exists = await existsAsync(uploadDir);
    if (!exists) {
      await mkdirAsync(uploadDir, { recursive: true });
    }
    return uploadDir;
  } catch (error) {
    console.error("Error creating uploads directory:", error);
    throw new Error("Failed to initialize upload directory");
  }
};

// Validate file type
const validateFileType = (file, allowedTypes) => {
  if (!allowedTypes.includes(file.mimetype)) {
    throw new BadRequestError(
      `Invalid file type. Allowed types: ${allowedTypes.join(", ")}`,
    );
  }
  return true;
};

// Validate file size
const validateFileSize = (file, maxSizeInMB) => {
  const maxSize = maxSizeInMB * 1024 * 1024; // Convert MB to bytes
  if (file.size > maxSize) {
    throw new BadRequestError(
      `File size too large. Maximum size is ${maxSizeInMB}MB`,
    );
  }
  return true;
};

// Delete file
const deleteFile = async (filePath) => {
  try {
    if (await existsAsync(filePath)) {
      await unlinkAsync(filePath);
    }
  } catch (error) {
    console.error("Error deleting file:", error);
    throw new Error("Failed to delete file");
  }
};

// Get file extension
const getFileExtension = (filename) => {
  return path.extname(filename).toLowerCase();
};

// Generate unique filename
const generateUniqueFilename = (originalname) => {
  const timestamp = Date.now();
  const randomString = Math.random().toString(36).substring(2, 8);
  const ext = getFileExtension(originalname);
  return `${timestamp}-${randomString}${ext}`;
};

module.exports = {
  ensureUploadsDir,
  validateFileType,
  validateFileSize,
  deleteFile,
  getFileExtension,
  generateUniqueFilename,
  unlinkAsync,
};
