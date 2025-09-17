const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    content: {
      type: String,
      trim: true,
      default: "",
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    group: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Group",
      default: null,
    },
    type: {
      type: String,
      enum: ["direct", "group"],
      required: true,
    },
    status: {
      type: String,
      enum: ["sent", "delivered", "read"],
      default: "sent",
    },
    attachments: [
      {
        url: { type: String },
        type: { type: String },
      },
    ],
    replyTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
      default: null,
    },
    readAt: {
      type: Date,
      default: null,
    },
    // Track message status per user for group messages
    messageStatus: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        status: {
          type: String,
          enum: ["sent", "delivered", "read"],
          default: "sent",
        },
        deliveredAt: Date,
        readAt: Date,
      },
    ],
    readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    // Soft delete flags
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    // Per-user hide/clear (messages hidden for specific users)
    deletedFor: [
      { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    ],
  },
  {
    timestamps: true,
  }
);

// Create text index for search functionality
messageSchema.index({ content: "text" });

module.exports = mongoose.model("Message", messageSchema);
