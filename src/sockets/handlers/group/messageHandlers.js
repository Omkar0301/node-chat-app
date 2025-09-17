const Message = require("../../../models/Message");
const { connections } = require("../../store");
const { getGroupUnreadCounts } = require("../../../utils/messageUtils");
const {
  checkGroupMembership,
  getUserMap,
  validateReplyTo,
  validateAttachments,
  isValidObjectId,
} = require("./helper");
const { UnauthorizedError } = require("../../../utils/errors");
const mongoose = require("mongoose");

function registerMessageHandlers(io, socket) {
  const userIdStr = socket.user._id.toString();
  const userId = socket.user._id;

  // Handle sync request for group unread counts
  socket.on("group:sync", async (callback) => {
    try {
      const unreadCounts = await getGroupUnreadCounts(userId);

      // Emit unread counts to the client
      socket.emit("group:unread-counts", {
        counts: unreadCounts,
        type: "group",
      });

      // Update status to delivered for all unread messages
      // Update all unread messages to 'delivered' status
      await Message.updateMany(
        {
          type: "group",
          messageStatus: {
            $elemMatch: {
              user: userId,
              status: { $in: ["sent", "delivered"] },
            },
          },
        },
        {
          $set: {
            "messageStatus.$.status": "delivered",
            "messageStatus.$.deliveredAt": new Date(),
          },
        },
      );

      callback?.({ success: true });
    } catch (error) {
      console.error("Error syncing group messages:", error);
      callback?.({ success: false, error: error.message });
    }
  });

  // Group message handler
  socket.on("group:send", async (data, callback) => {
    try {
      const { groupId, content, attachments, replyTo } = data || {};
      if (!groupId) throw new Error("groupId required");
      const trimmedContent = (content || "").trim();
      const { group } = await checkGroupMembership(groupId, socket.user._id);
      validateAttachments(attachments);
      await validateReplyTo(replyTo, groupId);
      if (!socket.rooms.has(`group_${groupId}`)) {
        await socket.join(`group_${groupId}`);
        console.log(`User ${userIdStr} joined group_${groupId} via group:send`);
      }
      const now = new Date();
      const memberIds = group.members
        .map((m) => m.toString())
        .filter((id) => id !== userIdStr);
      const message = new Message({
        sender: socket.user._id,
        group: groupId,
        content: trimmedContent,
        type: "group",
        status: "sent",
        attachments: attachments || [],
        replyTo: replyTo || null,
        messageStatus: memberIds.map((id) => ({
          user: id,
          status: "sent",
          sentAt: now,
        })),
      });
      await message.save();
      const userMap = await getUserMap(
        memberIds.map((id) => new mongoose.Types.ObjectId(id)),
      );
      const bulkOps = [];
      for (const memberId of memberIds) {
        const memberSocketId = connections.get(memberId);
        if (memberSocketId && io.sockets.sockets.has(memberSocketId)) {
          bulkOps.push({
            updateOne: {
              filter: { _id: message._id, "messageStatus.user": memberId },
              update: {
                $set: {
                  "messageStatus.$.status": "delivered",
                  "messageStatus.$.deliveredAt": new Date(),
                },
              },
            },
          });
          const member = userMap.get(memberId);
          io.to(`user_${userIdStr}`).emit("group:status", {
            groupId,
            messageId: message._id,
            updatedBy: memberId,
            status: {
              [memberId]: {
                status: "delivered",
                deliveredAt: new Date().toISOString(),
                user: member || null,
              },
            },
          });
        }
      }
      if (bulkOps.length > 0) {
        await Message.bulkWrite(bulkOps);
      }
      const updatedMessage = await Message.findById(message._id);
      for (const memberId of memberIds) {
        const memberSocketId = connections.get(memberId);
        if (memberSocketId && io.sockets.sockets.has(memberSocketId)) {
          io.to(`user_${memberId}`).emit("group:receive", updatedMessage);
        }
      }
      socket.emit("group:sent", updatedMessage);
      callback?.({ success: true, data: updatedMessage });
    } catch (error) {
      console.error("Error sending group message:", error);
      callback?.({
        success: false,
        error: error.message || "Failed to send group message",
      });
    }
  });

  // Group read receipts
  socket.on("group:read", async (data, callback) => {
    try {
      const { groupId, messageIds } = data || {};
      if (
        !groupId ||
        !messageIds ||
        !Array.isArray(messageIds) ||
        messageIds.length === 0
      ) {
        throw new Error("groupId and messageIds (array) are required");
      }
      if (messageIds.length > 50) {
        throw new Error("Too many messageIds (max 50)");
      }
      if (messageIds.some((id) => !isValidObjectId(id))) {
        throw new Error("Invalid messageId");
      }
      const { group } = await checkGroupMembership(groupId, socket.user._id);
      if (!socket.rooms.has(`group_${groupId}`)) {
        await socket.join(`group_${groupId}`);
        console.log(
          `User ${userIdStr} re-joined group_${groupId} for read event`,
        );
      }
      const userMap = await getUserMap(group.members);
      const bulkOps = [];
      const updatedMessageIds = [];
      for (const messageId of messageIds) {
        const message = await Message.findOne({
          _id: messageId,
          group: groupId,
          type: "group",
        });
        if (!message) {
          console.log(`Message ${messageId} not found or not a group message`);
          continue;
        }
        const statusIndex = message.messageStatus.findIndex(
          (s) => s.user.toString() === userIdStr,
        );
        if (
          statusIndex === -1 ||
          message.messageStatus[statusIndex].status === "read"
        ) {
          console.log(
            `Message ${messageId} not applicable or already read by ${userIdStr}`,
          );
          continue;
        }
        const now = new Date();
        bulkOps.push({
          updateOne: {
            filter: { _id: message._id },
            update: {
              $set: {
                [`messageStatus.${statusIndex}.status`]: "read",
                [`messageStatus.${statusIndex}.readAt`]: now,
              },
            },
          },
        });
        updatedMessageIds.push(message._id);
      }
      if (bulkOps.length > 0) {
        const result = await Message.bulkWrite(bulkOps);
        console.log(
          `Updated ${result.modifiedCount} messages to read for user ${userIdStr} in group ${groupId}`,
        );
      }
      const updatedMessages = await Message.find({
        _id: { $in: updatedMessageIds },
        group: groupId,
        type: "group",
      }).lean();
      for (const message of updatedMessages) {
        const status = {};
        message.messageStatus.forEach((s) => {
          const userId = s.user.toString();
          const user = userMap.get(userId);
          status[userId] = {
            status: s.status,
            user: user || null,
          };
          if (s.status === "read" && s.readAt) {
            status[userId].readAt = s.readAt.toISOString();
          } else if (s.status === "delivered" && s.deliveredAt) {
            status[userId].deliveredAt = s.deliveredAt.toISOString();
          } else if (s.status === "sent" && s.sentAt) {
            status[userId].sentAt = s.sentAt.toISOString();
          }
        });
        io.to(`group_${groupId}`).emit("group:status", {
          groupId,
          messageId: message._id,
          updatedBy: userIdStr,
          updatedAt: new Date().toISOString(),
          status,
        });
      }
      callback?.({ success: true, modifiedCount: updatedMessages.length });
    } catch (error) {
      console.error("Error processing group read receipts:", error);
      callback?.({
        success: false,
        error: error.message || "Failed to process read receipts",
      });
    }
  });

  // Delete a group message
  socket.on("group:message:delete", async (data, callback) => {
    try {
      const { groupId, messageId, forEveryone } = data || {};
      if (!groupId || !messageId) {
        throw new Error("groupId and messageId required");
      }
      // Get group, isAdmin, isCreator
      const { group, isAdmin, isCreator } = await checkGroupMembership(
        groupId,
        socket.user._id,
      );
      const message = await Message.findOne({
        _id: messageId,
        group: groupId,
        type: "group",
      });

      if (!message) throw new Error("Message not found");

      const userIdStr = socket.user._id.toString();
      const isSender = message.sender.toString() === userIdStr;

      if (forEveryone) {
        // Only sender or admin/creator can delete for everyone
        if (!(isSender || isAdmin || isCreator)) {
          throw new Error(
            "Only sender or admin/creator can delete for everyone",
          );
        }
        if (!message.isDeleted) {
          message.isDeleted = true;
          message.deletedAt = new Date();
          message.deletedBy = socket.user._id;
          // Optional: mark all as read to prevent wrong unread counts
          message.messageStatus = message.messageStatus.map((status) => ({
            ...status,
            status: "read",
            readAt: status.status !== "read" ? new Date() : status.readAt,
          }));
          await message.save();
        }

        // Notify all group members
        io.to(`group_${groupId}`).emit("group:messageDeleted", {
          groupId,
          messageId: message._id,
          forEveryone: true,
          deletedBy: userIdStr,
          deletedAt: message.deletedAt.toISOString(),
        });
      } else {
        // Delete for me only
        const alreadyHidden = (message.deletedFor || []).some(
          (u) => u.toString() === userIdStr,
        );
        if (!alreadyHidden) {
          message.deletedFor = [...(message.deletedFor || []), socket.user._id];
          // Update message status to read for this user
          message.messageStatus = message.messageStatus.map((status) => {
            if (
              status.user.toString() === userIdStr &&
              status.status !== "read"
            ) {
              return {
                ...status,
                status: "read",
                readAt: new Date(),
              };
            }
            return status;
          });
          await message.save();
        }

        // Notify only the current user
        io.to(`user_${userIdStr}`).emit("group:messageHidden", {
          groupId,
          messageId: message._id,
          forEveryone: false,
        });
      }

      // Update unread counts for all group members
      const memberIds = group.members.map((m) => m.toString());
      const memberCounts = await Promise.all(
        memberIds.map(async (memberId) => {
          const counts = await getGroupUnreadCounts(memberId);
          return { memberId, counts };
        }),
      );

      memberCounts.forEach(({ memberId, counts }) => {
        const socketId = connections.get(memberId);
        if (socketId && io.sockets.sockets.has(socketId)) {
          io.to(socketId).emit("group:unread-counts", {
            counts,
            type: "group",
          });
        }
      });

      callback?.({ success: true });
    } catch (error) {
      console.error("Error deleting group message:", error);
      callback?.({
        success: false,
        error: error.message || "Failed to delete message",
      });
    }
  });

  // Clear a group chat for self
  socket.on("group:chat:clear", async (data, callback) => {
    try {
      const { groupId } = data || {};
      if (!groupId) {
        throw new Error("groupId required");
      }
      const { group } = await checkGroupMembership(groupId, socket.user._id);
      const res = await Message.updateMany(
        { group: groupId, type: "group", deletedFor: { $ne: socket.user._id } },
        { $addToSet: { deletedFor: socket.user._id } },
      );
      io.to(`user_${userIdStr}`).emit("group:chatCleared", {
        groupId,
        modifiedCount: res.modifiedCount || 0,
      });
      callback?.({ success: true, modifiedCount: res.modifiedCount || 0 });
    } catch (error) {
      console.error("Error clearing group chat:", error);
      callback?.({
        success: false,
        error: error.message || "Failed to clear chat",
      });
    }
  });
}

module.exports = { registerMessageHandlers };
