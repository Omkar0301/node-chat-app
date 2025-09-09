const Message = require("../../models/Message");
const { connections } = require("../store");

function registerDirectHandlers(io, socket) {
  const userIdStr = socket.user._id.toString();

  // Direct message handler
  socket.on("message:send", async (data, callback) => {
    try {
      const { to, content, attachments, replyTo } = data || {};
      if (!to) return callback({ success: false, error: "Recipient required" });
      if (!content && (!attachments || attachments.length === 0))
        return callback({
          success: false,
          error: "Message content or attachments required",
        });

      const message = new Message({
        sender: socket.user._id,
        recipient: to,
        content: content || "",
        type: "direct",
        status: "sent",
        attachments: attachments || [],
        replyTo: replyTo || null,
      });

      await message.save();

      // Deliver if recipient is online
      const recipientSocketId = connections.get(to.toString());
      if (recipientSocketId) {
        message.status = "delivered";
        await message.save();
        io.to(recipientSocketId).emit("message:receive", message);
      }

      // Emit back to sender with current status
      io.to(`user_${userIdStr}`).emit("message:sent", message);

      callback?.({ success: true, data: message });
    } catch (error) {
      console.error("Error sending message:", error);
      callback?.({ success: false, error: "Failed to send message" });
    }
  });

  // Message delivery confirmation
  socket.on("message:delivered", async (data) => {
    const { messageId } = data || {};
    try {
      const message = await Message.findById(messageId);
      if (!message) return;

      if (message.recipient && message.recipient.toString() === socket.userId) {
        if (message.status !== "delivered") {
          message.status = "delivered";
          await message.save();
        }

        const senderSocketId = connections.get(message.sender.toString());
        if (senderSocketId) {
          io.to(senderSocketId).emit("message:status", {
            messageId: message._id,
            status: "delivered",
          });
        }
      }
    } catch (error) {
      console.error("Error confirming message delivery:", error);
    }
  });

  // Message read receipts
  socket.on("message:read", async (data) => {
    try {
      const { messageId } = data || {};
      const message = await Message.findById(messageId);
      if (
        message &&
        message.recipient.toString() === socket.user._id.toString()
      ) {
        message.status = "read";
        await message.save();
        const senderSocketId = connections.get(message.sender.toString());
        if (senderSocketId) {
          io.to(senderSocketId).emit("message:status", {
            messageId: message._id,
            status: "read",
          });
        }
      }
    } catch (error) {
      console.error("Error confirming message read:", error);
    }
  });

  // Delete a direct message
  socket.on("message:delete", async (data, callback) => {
    try {
      const { messageId, forEveryone } = data || {};
      if (!messageId)
        return callback?.({ success: false, error: "messageId required" });

      const message = await Message.findById(messageId);
      if (!message || message.type !== "direct") {
        return callback?.({ success: false, error: "Message not found" });
      }

      const currentUserId = socket.user._id.toString();
      const isParticipant =
        message.sender.toString() === currentUserId ||
        message.recipient?.toString() === currentUserId;
      if (!isParticipant) {
        return callback?.({ success: false, error: "Not authorized" });
      }

      if (forEveryone) {
        // Only sender can delete for everyone
        if (message.sender.toString() !== currentUserId) {
          return callback?.({
            success: false,
            error: "Only sender can delete for everyone",
          });
        }
        if (!message.isDeleted) {
          message.isDeleted = true;
          message.deletedAt = new Date();
          message.deletedBy = socket.user._id;
          await message.save();
        }

        // Notify both participants
        const otherId =
          message.sender.toString() === currentUserId
            ? message.recipient?.toString()
            : message.sender.toString();
        const otherSocketId = otherId ? connections.get(otherId) : null;

        io.to(`user_${currentUserId}`).emit("message:deleted", {
          messageId: message._id,
          forEveryone: true,
          deletedBy: currentUserId,
          deletedAt: message.deletedAt,
        });
        if (otherSocketId) {
          io.to(otherSocketId).emit("message:deleted", {
            messageId: message._id,
            forEveryone: true,
            deletedBy: currentUserId,
            deletedAt: message.deletedAt,
          });
        }
        return callback?.({ success: true });
      } else {
        // Delete for self only
        const alreadyHidden = (message.deletedFor || []).some(
          (u) => u.toString() === currentUserId,
        );
        if (!alreadyHidden) {
          message.deletedFor = [...(message.deletedFor || []), socket.user._id];
          await message.save();
        }
        // Acknowledge to requester and allow UI to remove locally
        io.to(`user_${currentUserId}`).emit("message:hidden", {
          messageId: message._id,
          forEveryone: false,
        });
        return callback?.({ success: true });
      }
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
      if (!withUserId) {
        return callback?.({ success: false, error: "withUserId required" });
      }
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

      // Only notify requester; other party's history is unaffected
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

module.exports = { registerDirectHandlers };
