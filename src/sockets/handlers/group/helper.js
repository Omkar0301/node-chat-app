const mongoose = require("mongoose");
const { UnauthorizedError } = require("../../../utils/errors");
const Group = require("../../../models/Group");
const User = require("../../../models/User");
const Message = require("../../../models/Message");

function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

async function checkGroupMembership(groupId, userId, requireAdmin = false) {
  if (!isValidObjectId(groupId) || !isValidObjectId(userId)) {
    throw new Error("Invalid ID");
  }
  const group = await Group.findById(groupId);
  if (!group) {
    throw new Error("Group not found");
  }
  const userIdStr = userId.toString();
  const isMember = group.members.some((m) => m.toString() === userIdStr);
  if (!isMember) {
    throw new UnauthorizedError("You are not a member of this group");
  }
  let isAdmin = false;
  let isCreator = false;
  if (requireAdmin) {
    isCreator = group.createdBy.toString() === userIdStr;
    isAdmin = group.admins.some((a) => a.toString() === userIdStr) || isCreator;
    if (!isAdmin) {
      throw new UnauthorizedError(
        "Only admins or creator can perform this action",
      );
    }
  }
  return { group, isAdmin, isCreator };
}

async function getUserMap(userIds) {
  const users = await User.find(
    { _id: { $in: userIds } },
    { username: 1, email: 1, profilePicture: 1, online: 1, lastSeen: 1 },
  );
  return new Map(users.map((u) => [u._id.toString(), u.getPublicProfile()]));
}

async function validateReplyTo(replyTo, groupId) {
  if (replyTo) {
    if (!isValidObjectId(replyTo)) {
      throw new Error("Invalid replyTo ID");
    }
    const exists = await Message.exists({
      _id: replyTo,
      group: groupId,
      type: "group",
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
  checkGroupMembership,
  getUserMap,
  validateReplyTo,
  validateAttachments,
};
