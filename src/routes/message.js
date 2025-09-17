const express = require("express");
const { check } = require("express-validator");
const { validate } = require("../middleware/validation");
const { auth } = require("../middleware/auth");
const {
  getConversation,
  getGroupConversation,
  getConversations,
  markMessagesAsRead,
  searchMessages,
} = require("../controllers/message");

const router = express.Router();

router.get(
  "/conversation/:userId",
  [
    auth,
    check("userId", "Valid user ID is required").isMongoId(),
    check("page")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Page must be a positive number"),
    check("limit")
      .optional()
      .isInt({ min: 1, max: 50 })
      .withMessage("Limit must be between 1 and 50"),
  ],
  validate,
  getConversation
);

router.get(
  "/group/:groupId",
  [
    auth,
    check("groupId", "Valid group ID is required").isMongoId(),
    check("page")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Page must be a positive number"),
    check("limit")
      .optional()
      .isInt({ min: 1, max: 50 })
      .withMessage("Limit must be between 1 and 50"),
  ],
  validate,
  getGroupConversation
);

router.get(
  "/conversations",
  [
    auth,
    check("page")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Page must be a positive number"),
    check("limit")
      .optional()
      .isInt({ min: 1, max: 50 })
      .withMessage("Limit must be between 1 and 50"),
  ],
  validate,
  getConversations
);

router.patch(
  "/mark-read",
  [
    auth,
    check("messageIds", "messageIds must be a non-empty array")
      .isArray({ min: 1 })
      .withMessage("At least one message ID is required"),
  ],
  validate,
  markMessagesAsRead
);

router.get(
  "/search",
  [
    auth,
    check("query", "Search query is required").notEmpty(),
    check("type")
      .optional()
      .isIn(["direct", "group", "all"])
      .withMessage("Type must be either 'direct', 'group', or 'all'"),
    check("userId")
      .optional()
      .isMongoId()
      .withMessage("Valid user ID is required when type is 'direct'"),
    check("groupId")
      .optional()
      .isMongoId()
      .withMessage("Valid group ID is required when type is 'group'"),
    check("page")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Page must be a positive number"),
    check("limit")
      .optional()
      .isInt({ min: 1, max: 50 })
      .withMessage("Limit must be between 1 and 50"),
  ],
  validate,
  searchMessages
);

router.get(
  "/search",
  [
    auth,
    check("query", "Search query is required").notEmpty(),
    check("type")
      .optional()
      .isIn(["direct", "group", "all"])
      .withMessage("Type must be either 'direct', 'group', or 'all'"),
    check("userId")
      .optional()
      .isMongoId()
      .withMessage("Valid user ID is required when type is 'direct'"),
    check("groupId")
      .optional()
      .isMongoId()
      .withMessage("Valid group ID is required when type is 'group'"),
    check("page")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Page must be a positive number"),
    check("limit")
      .optional()
      .isInt({ min: 1, max: 50 })
      .withMessage("Limit must be between 1 and 50"),
  ],
  validate,
  searchMessages,
);

module.exports = router;
