const express = require("express");
const { check } = require("express-validator");
const { auth } = require("../middleware/auth");
const { validate } = require("../middleware/validation");
const { uploadFile } = require("../middleware/upload");
const groupController = require("../controllers/group");

const router = express.Router();

// Update group profile picture
router.put(
  "/:groupId/photo",
  [
    auth,
    check("groupId", "Valid group ID is required").isMongoId(),
    validate,
    uploadFile("photo")
  ],
  groupController.updateGroupPhoto
);

module.exports = router;
