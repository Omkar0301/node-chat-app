const express = require("express");
const { check } = require("express-validator");
const userController = require("../controllers/user");
const { validate } = require("../middleware/validation");
const { auth } = require("../middleware/auth");// Import upload middleware
const { uploadFile } = require("../middleware/upload");

const router = express.Router();

// Get current user profile
router.get("/profile", auth, userController.getProfile);

// Get all users (except current user)
router.get("/", auth, userController.getUsers);

// Search users
router.get(
  "/search",
  [auth, check("query", "Search query is required").not().isEmpty()],
  validate,
  userController.searchUsers,
);

// Get user by ID
router.get("/:id", auth, userController.getUserById);

// Update user profile picture (handled via REST API for file upload)
router.put(
  "/profile/picture",
  auth,
  uploadFile("profilePicture"),
  userController.updateProfilePicture
);

// Change password
router.put(
  "/change-password",
  [
    auth,
    check("currentPassword", "Current password is required").exists(),
    check(
      "newPassword",
      "Please enter a password with 6 or more characters",
    ).isLength({ min: 6 }),
  ],
  validate,
  userController.changePassword,
);


// Delete user account
router.delete("/", auth, userController.deleteAccount);

module.exports = router;
