const Message = require("../models/Message");
const { validationResult } = require("express-validator");

const getConversation = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { userId } = req.params;
    const currentUser = req.user.userId;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 50);
    const skip = (page - 1) * limit;

    const [messages, total] = await Promise.all([
      Message.find({
        $and: [
          {
            $or: [
              { sender: currentUser, recipient: userId },
              { sender: userId, recipient: currentUser },
            ],
          },
          { deletedFor: { $ne: currentUser } },
          { isDeleted: { $ne: true } },
        ],
      })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("sender", "name email")
        .populate("recipient", "name email"),
      Message.countDocuments({
        $and: [
          {
            $or: [
              { sender: currentUser, recipient: userId },
              { sender: userId, recipient: currentUser },
            ],
          },
          { deletedFor: { $ne: currentUser } },
          { isDeleted: { $ne: true } },
        ],
      }),
    ]);

    const totalPages = Math.ceil(total / limit);

    res.json({
      success: true,
      data: messages.reverse(),
      pagination: {
        total,
        page,
        limit,
        totalPages,
        hasNext: page < totalPages,
        hasPrevious: page > 1,
      },
    });
  } catch (error) {
    console.error("Error fetching conversation:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch conversation",
      error: error.message,
    });
  }
};

const getGroupConversation = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { groupId } = req.params;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 50);
    const skip = (page - 1) * limit;

    const [messages, total] = await Promise.all([
      Message.find({
        $and: [
          { group: groupId },
          { type: "group" },
          { deletedFor: { $ne: req.user.userId } },
          { isDeleted: { $ne: true } },
        ],
      })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("sender", "name email")
        .populate("group", "name"),
      Message.countDocuments({
        $and: [
          { group: groupId },
          { type: "group" },
          { deletedFor: { $ne: req.user.userId } },
          { isDeleted: { $ne: true } },
        ],
      }),
    ]);

    const totalPages = Math.ceil(total / limit);

    res.json({
      success: true,
      data: messages.reverse(),
      pagination: {
        total,
        page,
        limit,
        totalPages,
        hasNext: page < totalPages,
        hasPrevious: page > 1,
      },
    });
  } catch (error) {
    console.error("Error fetching group conversation:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch group conversation",
      error: error.message,
    });
  }
};

const getConversations = async (req, res) => {
  try {
    const currentUser = req.user.userId;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 50);
    const skip = (page - 1) * limit;

    const userMessages = await Message.aggregate([
      {
        $match: {
          $and: [
            { $or: [{ sender: currentUser }, { recipient: currentUser }] },
            { deletedFor: { $ne: currentUser } },
            { isDeleted: { $ne: true } },
          ],
        },
      },
      {
        $project: {
          otherUser: {
            $cond: [{ $eq: ["$sender", currentUser] }, "$recipient", "$sender"],
          },
          message: "$$ROOT",
        },
      },
      { $sort: { "message.createdAt": -1 } },
      {
        $group: {
          _id: "$otherUser",
          latestMessage: { $first: "$message" },
          unreadCount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$message.recipient", currentUser] },
                    { $ne: ["$message.status", "read"] },
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
      { $skip: skip },
      { $limit: limit },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "user",
        },
      },
      { $unwind: "$user" },
      {
        $project: {
          _id: 0,
          user: {
            _id: "$user._id",
            name: "$user.name",
            email: "$user.email",
            avatar: "$user.avatar",
          },
          latestMessage: 1,
          unreadCount: 1,
        },
      },
    ]);

    const total = await Message.distinct("recipient", {
      $and: [
        { $or: [{ sender: currentUser }, { recipient: currentUser }] },
        { deletedFor: { $ne: currentUser } },
        { isDeleted: { $ne: true } },
      ],
    }).countDocuments();

    const totalPages = Math.ceil(total / limit);

    res.json({
      success: true,
      data: userMessages,
      pagination: {
        total,
        page,
        limit,
        totalPages,
        hasNext: page < totalPages,
        hasPrevious: page > 1,
      },
    });
  } catch (error) {
    console.error("Error fetching conversations:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch conversations",
      error: error.message,
    });
  }
};

const markMessagesAsRead = async (req, res) => {
  try {
    const { messageIds } = req.body;
    const currentUser = req.user.userId;

    if (!messageIds || !Array.isArray(messageIds) || messageIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Please provide message IDs to mark as read",
      });
    }

    await Message.updateMany(
      {
        _id: { $in: messageIds },
        recipient: currentUser,
        status: { $ne: "read" },
        deletedFor: { $ne: currentUser },
        isDeleted: { $ne: true },
      },
      { $set: { status: "read", readAt: new Date() } }
    );

    res.json({
      success: true,
      message: "Messages marked as read",
    });
  } catch (error) {
    console.error("Error marking messages as read:", error);
    res.status(500).json({
      success: false,
      message: "Failed to mark messages as read",
      error: error.message,
    });
  }
};

const searchMessages = async (req, res) => {
  try {
    const { query, type, userId, groupId } = req.query;
    const currentUser = req.user.userId;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 50);
    const skip = (page - 1) * limit;

    if (!query || query.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: "Search query is required",
      });
    }

    // Development branch code
    let searchQuery = {
      $and: [
        { $text: { $search: query } },
        { deletedFor: { $ne: currentUser } },
        { isDeleted: { $ne: true } },
      ],
    };

    if (type === "direct") {
      if (!userId) {
        return res.status(400).json({
          success: false,
          message: "User ID is required for direct messages",
        });
      }
      searchQuery.$and.push({
        $or: [
          { sender: currentUser, recipient: userId },
          { sender: userId, recipient: currentUser },
        ],
      });
    } else if (type === "group") {
      if (!groupId) {
        return res.status(400).json({
          success: false,
          message: "Group ID is required for group messages",
        });
      }
      searchQuery.$and.push({ group: groupId });
    } else {
      // Search across all user's conversations
      searchQuery.$and.push({
        $or: [
          { sender: currentUser },
          { recipient: currentUser },
          { "messageStatus.user": currentUser },
        ],
      });
    }

    const [messages, total] = await Promise.all([
      Message.find(searchQuery)
        .sort({ score: { $meta: "textScore" } })
        .skip(skip)
        .limit(limit)
        .populate("sender", "name email")
        .populate("recipient", "name email")
        .populate("group", "name"),
      Message.countDocuments(searchQuery),
    ]);

    const totalPages = Math.ceil(total / limit);

    res.json({
      success: true,
      data: messages,
      pagination: {
        total,
        page,
        limit,
        totalPages,
        hasNext: page < totalPages,
        hasPrevious: page > 1,
      },
    });
  } catch (error) {
    console.error("Error searching messages:", error);
    res.status(500).json({
      success: false,
      message: "Failed to search messages",
      error: error.message,
    });
  }
};

module.exports = {
  getConversation,
  getGroupConversation,
  getConversations,
  markMessagesAsRead,
  searchMessages,
};
