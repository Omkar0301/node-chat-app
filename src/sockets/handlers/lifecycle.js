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

    // Fetch undelivered messages when user comes online
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
