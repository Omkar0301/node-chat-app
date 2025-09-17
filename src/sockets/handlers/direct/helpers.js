const mongoose = require("mongoose");
const { UnauthorizedError } = require("../../../utils/errors");
const User = require("../../../models/User");
const Message = require("../../../models/Message");

function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

async function checkDirectParticipant(messageId, userId) {
  if (!isValidObjectId(messageId) || !isValidObjectId(userId)) {
    throw new Error("Invalid ID");
  }
  const message = await Message.findById(messageId);
  if (!message || message.type !== "direct") {
    throw new Error("Message not found or not direct");
  }
  const userIdStr = userId.toString();
  const isParticipant =
    message.sender.toString() === userIdStr ||
    message.recipient?.toString() === userIdStr;
  if (!isParticipant) {
    throw new UnauthorizedError("Not authorized for this message");
  }
  const isSender = message.sender.toString() === userIdStr;
  return { message, isSender };
}

async function validateRecipient(to) {
  if (!isValidObjectId(to)) {
    throw new Error("Invalid recipient ID");
  }
  const user = await User.exists({ _id: to });
  if (!user) {
    throw new Error("Recipient not found");
  }
}

async function validateReplyTo(replyTo, sender, recipient) {
  if (replyTo) {
    if (!isValidObjectId(replyTo)) {
      throw new Error("Invalid replyTo ID");
    }
    const exists = await Message.exists({
      _id: replyTo,
      type: "direct",
      $or: [
        { sender, recipient },
        { sender: recipient, recipient: sender },
      ],
    });
    if (!exists) {
      throw new Error("ReplyTo message not found");
    }
  }
}

function validateAttachments(attachments) {
  if (attachments && !Array.isArray(attachments)) {
    throw new Error("Attachments must be an array");
  }
  if (attachments && attachments.length > 10) {
    throw new Error("Too many attachments (max 10)");
  }
}

module.exports = {
  isValidObjectId,
  checkDirectParticipant,
  validateRecipient,
  validateReplyTo,
  validateAttachments,
};
