const Message = require("../../../models/Message");
const { connections } = require("../../store");
const { getDirectUnreadCounts } = require("../../../utils/messageUtils");

const {
  checkDirectParticipant,
  validateRecipient,
  validateReplyTo,
  validateAttachments,
  isValidObjectId,
} = require("./helpers");

function registerMessageHandlers(io, socket) {
  const userIdStr = socket.user._id.toString();

  // Direct message handler
  socket.on("message:send", async (data, callback) => {
    try {
      const { to, content, attachments, replyTo } = data || {};
      if (!to) throw new Error("Recipient required");
      const trimmedContent = (content || "").trim();
      if (!trimmedContent && (!attachments || attachments.length === 0)) {
        throw new Error("Message content or attachments required");
      }
      await validateRecipient(to);
      validateAttachments(attachments);
      await validateReplyTo(replyTo, socket.user._id, to);
      const message = new Message({
        sender: socket.user._id,
        recipient: to,
        content: trimmedContent,
        type: "direct",
        status: "sent",
        attachments: attachments || [],
        replyTo: replyTo || null,
      });
      await message.save();
      const recipientRoom = `user_${to.toString()}`;
      const isRecipientOnline = connections.has(to.toString());
      let updatedMessage = message;
      if (isRecipientOnline) {
        message.status = "delivered";
        await message.save();
        updatedMessage = await Message.findById(message._id);
        io.to(recipientRoom).emit("message:receive", updatedMessage);
      }
      io.to(`user_${userIdStr}`).emit("message:sent", updatedMessage);
      callback?.({ success: true, data: updatedMessage });
    } catch (error) {
      console.error("Error sending message:", error);
      callback?.({
        success: false,
        error: error.message || "Failed to send message",
      });
    }
  });

  // Message delivery confirmation
  socket.on("message:delivered", async (data) => {
    try {
      const { messageId } = data || {};
      if (!messageId) return;

      const { message } = await checkDirectParticipant(
        messageId,
        socket.user._id,
      );
      if (message.recipient?.toString() !== socket.user._id.toString()) return;

      if (message.status !== "delivered") {
        message.status = "delivered";
        await message.save();
      }

      // Populate sender & recipient details
      const populatedMessage = await Message.findById(message._id)
        .populate("sender", "_id fullName email")
        .populate("recipient", "_id fullName email");

      const payload = {
        messageId: populatedMessage._id,
        status: "delivered",
        sender: populatedMessage.sender,
        recipient: populatedMessage.recipient,
      };

      io.to(`user_${message.sender.toString()}`).emit(
        "message:status",
        payload,
      );
      io.to(`user_${message.recipient.toString()}`).emit(
        "message:status",
        payload,
      );
    } catch (error) {
      console.error("Error confirming message delivery:", error);
    }
  });
  // Handle sync request from client to get unread message counts
  socket.on("messages:sync", async (callback) => {
    try {
      const userId = socket.user._id;
      const unreadCounts = await getDirectUnreadCounts(userId);

      // Emit unread counts to the client
      socket.emit("messages:unread-counts", {
        counts: unreadCounts,
        type: "direct",
      });

      // Update status to delivered for all unread messages
      await Message.updateMany(
        {
          recipient: userId,
          status: { $in: ["sent", "delivered"] },
          type: "direct",
        },
        { $set: { status: "delivered" } },
      );

      callback?.({ success: true });
    } catch (error) {
      console.error("Error syncing messages:", error);
      callback?.({ success: false, error: error.message });
    }
  });

  // Message read receipts
  socket.on("message:read", async (data) => {
    try {
      const { messageId } = data || {};
      if (!messageId) return;

      const { message } = await checkDirectParticipant(
        messageId,
        socket.user._id,
      );
      if (message.recipient?.toString() !== socket.user._id.toString()) return;

      if (message.status !== "read") {
        message.status = "read";
        message.readAt = new Date(); // track read time
        await message.save();
      }

      const populatedMessage = await Message.findById(message._id)
        .populate("sender", "_id fullName email")
        .populate("recipient", "_id fullName email");

      const payload = {
        messageId: populatedMessage._id,
        status: "read",
        sender: populatedMessage.sender,
        recipient: populatedMessage.recipient,
        readAt: populatedMessage.readAt,
      };

      io.to(`user_${message.sender.toString()}`).emit(
        "message:status",
        payload,
      );
      io.to(`user_${message.recipient.toString()}`).emit(
        "message:status",
        payload,
      );
    } catch (error) {
      console.error("Error confirming message read:", error);
    }
  });

  // Delete a direct message
  socket.on("message:delete", async (data, callback) => {
    try {
      const { messageId, forEveryone } = data || {};
      if (!messageId) throw new Error("messageId required");
      const { message, isSender } = await checkDirectParticipant(
        messageId,
        socket.user._id,
      );
      const currentUserId = socket.user._id.toString();
      const otherId = isSender
        ? message.recipient?.toString()
        : message.sender.toString();

      if (forEveryone) {
        if (!isSender) {
          throw new Error("Only sender can delete for everyone");
        }
        if (!message.isDeleted) {
          message.isDeleted = true;
          message.deletedAt = new Date();
          message.deletedBy = socket.user._id;
          // Mark as read for both users when deleted
          if (message.status !== "read") {
            message.status = "read";
          }
          await message.save();
        }

        // Notify sender
        io.to(`user_${currentUserId}`).emit("message:deleted", {
          messageId: message._id,
          forEveryone: true,
          deletedBy: currentUserId,
          deletedAt: message.deletedAt.toISOString(),
        });

        // Notify recipient if online
        if (otherId && connections.has(otherId)) {
          io.to(`user_${otherId}`).emit("message:deleted", {
            messageId: message._id,
            forEveryone: true,
            deletedBy: currentUserId,
            deletedAt: message.deletedAt.toISOString(),
          });
        }
      } else {
        // Delete for me only
        const alreadyHidden = (message.deletedFor || []).some(
          (u) => u.toString() === currentUserId,
        );
        if (!alreadyHidden) {
          message.deletedFor = [...(message.deletedFor || []), socket.user._id];
          // If this was an unread message, mark it as read
          if (
            message.recipient?.toString() === currentUserId &&
            message.status !== "read"
          ) {
            message.status = "read";
          }
          await message.save();
        }
        io.to(`user_${currentUserId}`).emit("message:hidden", {
          messageId: message._id,
          forEveryone: false,
        });
      }

      // Update unread counts for both users
      const updateCountsForUser = async (userId) => {
        const counts = await getDirectUnreadCounts(userId);
        const socketId = connections.get(userId);
        if (socketId && io.sockets.sockets.has(socketId)) {
          io.to(socketId).emit("messages:unread-counts", {
            counts,
            type: "direct",
          });
        }
      };

      // Update counts for both sender and recipient
      await Promise.all([
        updateCountsForUser(currentUserId),
        otherId ? updateCountsForUser(otherId) : Promise.resolve(),
      ]);

      callback?.({ success: true });
    } catch (error) {
      console.error("Error deleting direct message:", error);
      callback?.({
        success: false,
        error: error.message || "Failed to delete message",
      });
    }
  });

  // Clear a direct chat for self
  socket.on("chat:clear", async (data, callback) => {
    try {
      const { withUserId } = data || {};
      if (!withUserId) throw new Error("withUserId required");
      if (!isValidObjectId(withUserId)) throw new Error("Invalid withUserId");
      const currentUserId = socket.user._id;
      const res = await Message.updateMany(
        {
          $or: [
            { sender: currentUserId, recipient: withUserId },
            { sender: withUserId, recipient: currentUserId },
          ],
          type: "direct",
          deletedFor: { $ne: currentUserId },
        },
        { $addToSet: { deletedFor: currentUserId } },
      );
      io.to(`user_${currentUserId.toString()}`).emit("chat:cleared", {
        withUserId,
        modifiedCount: res.modifiedCount || 0,
      });
      callback?.({ success: true, modifiedCount: res.modifiedCount || 0 });
    } catch (error) {
      console.error("Error clearing direct chat:", error);
      callback?.({
        success: false,
        error: error.message || "Failed to clear chat",
      });
    }
  });
}

module.exports = { registerMessageHandlers };
