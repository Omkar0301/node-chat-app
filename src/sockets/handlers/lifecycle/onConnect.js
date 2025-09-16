const Message = require("../../../models/Message");
const User = require("../../../models/User");
const { connections } = require("../../store");
const mongoose = require("mongoose");

async function setupOnConnect(io, socket) {
  const userIdStr = socket.user._id.toString();
  const userId = socket.user._id;

  try {
    await User.findByIdAndUpdate(userId, {
      online: true,
      socketId: socket.id,
      lastSeen: null,
    });

    socket.broadcast.emit("user:status", {
      userId,
      online: true,
    });

    socket.emit("connection:established", {
      message: "Successfully connected to the server",
      userId: userId,
    });

    socket.emit("messages:sync");
    socket.emit("group:sync");

    await Promise.all([
      Message.updateMany(
        {
          recipient: userId,
          status: { $in: ["sent", "delivered"] },
          type: "direct",
        },
        { $set: { status: "delivered" } }
      ),
      Message.updateMany(
        {
          type: "group",
          messageStatus: { $elemMatch: { user: userId, status: "sent" } },
        },
        {
          $set: {
            "messageStatus.$[elem].status": "delivered",
            "messageStatus.$[elem].deliveredAt": new Date(),
          },
        },
        { arrayFilters: [{ "elem.user": userId, "elem.status": "sent" }] }
      ),
    ]);
  } catch (err) {}
}

module.exports = { setupOnConnect };
