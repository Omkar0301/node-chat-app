const express = require("express");
const { check } = require("express-validator");
const authController = require("../controllers/auth");
const { validate } = require("../middleware/validation");
const { auth } = require("../middleware/auth");

const router = express.Router();

router.post(
  "/register",
  [
    check("username", "Username is required").not().isEmpty(),
    check("email", "Please include a valid email").isEmail(),
    check(
      "password",
      "Please enter a password with 6 or more characters",
    ).isLength({ min: 6 }),
  ],
  validate,
  authController.register,
);

router.post(
  "/login",
  [
    check("email", "Please include a valid email").isEmail(),
    check("password", "Password is required").exists(),
  ],
  validate,
  authController.login,
);

router.get("/me", auth, authController.getMe);
router.post("/refresh-token", authController.refreshToken);
router.post("/logout", auth, authController.logout);

module.exports = router;
