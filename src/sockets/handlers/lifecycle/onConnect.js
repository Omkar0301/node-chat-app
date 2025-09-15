const Message = require("../../../models/Message");
const User = require("../../../models/User");
const { connections } = require("../../store");
const mongoose = require("mongoose");

async function setupOnConnect(io, socket) {
  const userIdStr = socket.user._id.toString();
  const userId = socket.user._id;

  try {
    // Update user status
    await User.findByIdAndUpdate(userId, {
      online: true,
      socketId: socket.id,
      lastSeen: null, // Reset lastSeen when online
    });
    socket.broadcast.emit("user:status", {
      userId,
      online: true,
    });

    // Notify the user about their connection status
    socket.emit("connection:established", {
      message: "Successfully connected to the server",
      userId: userId,
    });

    // Trigger sync for both direct and group messages
    try {
      // Emit sync events for both direct and group messages
      socket.emit("messages:sync");
      socket.emit("group:sync");
      console.log("Triggered sync for both direct and group messages");
    } catch (error) {
      console.error("Error triggering message sync:", error);
    }

    // Update status of any undelivered messages to delivered
    // This ensures we don't miss any messages that were sent while the user was offline
    await Promise.all([
      // Update direct messages
      Message.updateMany(
        {
          recipient: userId,
          status: { $in: ["sent", "delivered"] },
          type: "direct",
        },
        { $set: { status: "delivered" } },
      ),

      // Update group messages
      Message.updateMany(
        {
          type: "group",
          "messageStatus.user": userId,
          "messageStatus.status": "sent",
        },
        { $set: { "messageStatus.$.status": "delivered" } },
      ),
    ]);

    console.log(`Updated message status for user ${userId} on connect`);
  } catch (err) {
    console.error("Error in connection handler:", err);
  }
}

module.exports = { setupOnConnect };
