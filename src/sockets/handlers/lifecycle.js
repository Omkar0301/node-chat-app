const Message = require("../../models/Message");
const User = require("../../models/User");
const { connections } = require("../store");

async function setupOnConnect(io, socket) {
  const userIdStr = socket.user._id.toString();

  try {
    // Update user status
    await User.findByIdAndUpdate(socket.user._id, {
      online: true,
      socketId: socket.id,
    });
    socket.broadcast.emit("user:status", {
      userId: socket.user._id,
      online: true,
    });

    // Fetch undelivered DIRECT messages when user comes online
    const messages = await Message.find({
      recipient: socket.user._id,
      status: "sent",
    }).lean();

    if (messages.length > 0) {
      const messageIds = messages.map((m) => m._id);

      // Update all messages to delivered status first
      await Message.updateMany(
        { _id: { $in: messageIds } },
        { $set: { status: "delivered" } },
      );

      // Then send all undelivered messages to the user
      messages.forEach((message) => {
        message.status = "delivered";
        socket.emit("message:receive", message);
      });

      console.log(
        `Delivered ${messages.length} pending messages to user ${socket.user._id}`,
      );
    }

    // Fetch undelivered GROUP messages for this user (per-recipient status)
    const groupMessages = await Message.find({
      type: "group",
      messageStatus: {
        $elemMatch: { user: socket.user._id, status: "sent" },
      },
    }).lean();

    if (groupMessages.length > 0) {
      for (const gm of groupMessages) {
        // Update this user's delivery status for the message
        await Message.updateOne(
          { _id: gm._id, "messageStatus.user": socket.user._id },
          {
            $set: {
              "messageStatus.$.status": "delivered",
              "messageStatus.$.deliveredAt": new Date(),
            },
          },
        );
        // Emit to the user
        socket.emit("group:receive", {
          ...gm,
          messageStatus: gm.messageStatus,
        });

        // Notify the original sender that this user has now received the message
        if (gm.sender) {
          const senderId = gm.sender.toString();
          if (senderId) {
            // Notify across all of the sender's sockets via their user room
            io.to(`user_${senderId}`).emit("group:status", {
              groupId: gm.group?.toString?.() || gm.group,
              messageId: gm._id,
              userId: socket.user._id,
              status: "delivered",
              deliveredAt: new Date().toISOString(),
            });
          }
        }
      }

      console.log(
        `Delivered ${groupMessages.length} pending group messages to user ${socket.user._id}`,
      );
    }
  } catch (err) {
    console.error("Error in connection handler:", err);
  }
}

function registerDisconnect(io, socket) {
  socket.on("disconnect", async () => {
    console.log("User disconnected:", socket.userId);

    try {
      connections.delete(socket.userId);

      await User.findByIdAndUpdate(socket.user._id, {
        online: false,
        lastSeen: new Date(),
        socketId: null,
      });

      socket.broadcast.emit("user:status", {
        userId: socket.user._id,
        online: false,
        lastSeen: new Date(),
      });
    } catch (error) {
      console.error("Error updating user status on disconnect:", error);
    }
  });
}

module.exports = { setupOnConnect, registerDisconnect };
