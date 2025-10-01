const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { BadRequestError } = require("../utils/errors");

// Ensure uploads directory exists
const uploadsDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, file.fieldname + "-" + uniqueSuffix + ext);
  },
});

// File filter
const fileFilter = (req, file, cb) => {
  const filetypes = /jpeg|jpg|png|gif|mp4|mov|avi|pdf|doc|docx|txt/;
  const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = filetypes.test(file.mimetype);

  if (extname && mimetype) {
    return cb(null, true);
  } else {
    cb(new BadRequestError("Only images, videos, and documents are allowed!"));
  }
};

// Initialize upload
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 1, // Limit to 1 file per request
  },
  preservePath: true,
});

// Middleware to handle single file upload
const uploadFile = (fieldName, required = false) => (req, res, next) => {
  const uploadSingle = upload.single(fieldName);

  uploadSingle(req, res, (err) => {
    if (err) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return next(
          new BadRequestError("File size too large. Max 10MB allowed")
        );
      } else if (err.code === "LIMIT_FILE_COUNT") {
        return next(new BadRequestError("Only one file is allowed"));
      }
      return next(new BadRequestError("Error uploading file"));
    }

    if (required && !req.file) {
      return next(new BadRequestError(`No file was uploaded for ${fieldName}`));
    }

    if (req.file && !fs.existsSync(req.file.path)) {
      return next(new BadRequestError("Error processing uploaded file"));
    }

    next();
  });
};

// Middleware to handle multiple file uploads
const uploadFiles =
  (fieldName, maxCount = 5) =>
  (req, res, next) => {
    const uploadMultiple = upload.array(fieldName, maxCount);

    uploadMultiple(req, res, (err) => {
      if (err) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return next(
            new BadRequestError(
              "File size too large. Max 10MB per file allowed."
            )
          );
        }
        if (err.code === "LIMIT_UNEXPECTED_FILE") {
          return next(
            new BadRequestError(`Maximum ${maxCount} files allowed.`)
          );
        }
        return next(err);
      }
      next();
    });
  };

module.exports = {
  upload,
  uploadFile,
  uploadFiles,
};
