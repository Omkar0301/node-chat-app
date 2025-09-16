const Message = require("../models/Message");
const mongoose = require("mongoose");

/**
 * Get unread message counts for direct messages
 * @param {mongoose.Types.ObjectId} userId - The user ID to get unread counts for
 * @returns {Promise<Array>} Array of objects with senderId and count
 */
async function getDirectUnreadCounts(userId) {
  return Message.aggregate([
    {
      $match: {
        recipient: userId,
        status: { $in: ["sent", "delivered"] },
        type: "direct",
        // Exclude messages that are deleted for everyone or deleted for this user
        $and: [
          { isDeleted: { $ne: true } },
          {
            $or: [
              { deletedFor: { $exists: false } },
              { deletedFor: { $ne: userId } },
            ],
          },
        ],
      },
    },
    {
      $group: {
        _id: "$sender",
        count: { $sum: 1 },
      },
    },
    {
      $project: {
        _id: 0,
        senderId: "$_id",
        count: 1,
        type: { $literal: "direct" },
      },
    },
  ]);
}

/**
 * Get unread message counts for group messages
 * @param {mongoose.Types.ObjectId} userId - The user ID to get unread counts for
 * @returns {Promise<Array>} Array of objects with groupId and count
 */
async function getGroupUnreadCounts(userId) {
  return Message.aggregate([
    {
      $match: {
        type: "group",
        // Exclude messages that are deleted for everyone or deleted for this user
        $and: [
          { isDeleted: { $ne: true } },
          {
            $or: [
              { deletedFor: { $exists: false } },
              { deletedFor: { $ne: userId } },
            ],
          },
        ],
        messageStatus: {
          $elemMatch: {
            user: userId,
            status: { $in: ["sent", "delivered"] },
          },
        },
      },
    },
    {
      $unwind: "$messageStatus",
    },
    {
      $match: {
        "messageStatus.user": userId,
        "messageStatus.status": { $in: ["sent", "delivered"] },
      },
    },
    {
      $group: {
        _id: "$group",
        count: { $sum: 1 },
      },
    },
    {
      $project: {
        _id: 0,
        groupId: "$_id",
        count: 1,
        type: { $literal: "group" },
      },
    },
  ]);
}

/**
 * Get all unread message counts (both direct and group)
 * @param {mongoose.Types.ObjectId} userId - The user ID to get unread counts for
 * @returns {Promise<Object>} Object containing direct and group unread counts
 */
async function getAllUnreadCounts(userId) {
  const [directCounts, groupCounts] = await Promise.all([
    getDirectUnreadCounts(userId),
    getGroupUnreadCounts(userId),
  ]);

  return {
    direct: directCounts,
    group: groupCounts,
    total: [
      ...directCounts.map((c) => ({
        ...c,
        type: "direct",
        id: c.senderId,
      })),
      ...groupCounts.map((c) => ({
        ...c,
        type: "group",
        id: c.groupId,
      })),
    ],
  };
}

module.exports = {
  getDirectUnreadCounts,
  getGroupUnreadCounts,
  getAllUnreadCounts,
};
