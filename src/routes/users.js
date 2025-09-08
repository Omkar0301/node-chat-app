const express = require("express");
const { check } = require("express-validator");
const userController = require("../controllers/user");
const { validate } = require("../middleware/validation");
const { auth } = require("../middleware/auth");

const router = express.Router();

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

// Update user profile
router.put(
  "/profile",
  [
    auth,
    check("username", "Username is required").optional().not().isEmpty(),
    check("email", "Please include a valid email").optional().isEmail(),
  ],
  validate,
  userController.updateProfile,
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

// Upload profile picture
router.post("/profile-picture", [auth], userController.uploadProfilePicture);

// Delete user account
router.delete("/", auth, userController.deleteAccount);

module.exports = router;
