const multer = require("multer");
const path = require("path");
const { BadRequestError } = require("../utils/errors");

// Configure storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/");
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
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
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
});

// Middleware to handle single file upload
const uploadFile = (fieldName) => (req, res, next) => {
  const uploadSingle = upload.single(fieldName);

  uploadSingle(req, res, (err) => {
    if (err) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return next(
          new BadRequestError("File size too large. Max 10MB allowed."),
        );
      }
      return next(err);
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
              "File size too large. Max 10MB per file allowed.",
            ),
          );
        }
        if (err.code === "LIMIT_UNEXPECTED_FILE") {
          return next(
            new BadRequestError(`Maximum ${maxCount} files allowed.`),
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
