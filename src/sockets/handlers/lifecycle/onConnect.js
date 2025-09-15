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

    // Fetch and deliver undelivered DIRECT messages
    const directMessages = await Message.find({
      recipient: userId,
     status: { $in: ["sent", "delivered"] },
      type: "direct",
    }).lean(); 
    if (directMessages.length > 0) {
      const messageIds = directMessages.map((m) => m._id);
      await Message.updateMany(
        { _id: { $in: messageIds } },
        { $set: { status: "delivered" } }
      );
      directMessages.forEach((message) => {
        message.status = "delivered";
        socket.emit("message:receive", message);
      });
      console.log(
        `Delivered ${directMessages.length} pending direct messages to user ${userId}`
      );
    }

    // Fetch and deliver undelivered GROUP messages
    const groupMessages = await Message.find({
      type: "group",
      messageStatus: {
        $elemMatch: { user: userId, status: "sent" },
      },
    }).lean();
    if (groupMessages.length > 0) {
      const bulkOps = [];
      for (const gm of groupMessages) {
        const statusIndex = gm.messageStatus.findIndex(
          (s) => s.user.toString() === userIdStr
        );
        if (statusIndex !== -1) {
          bulkOps.push({
            updateOne: {
              filter: { _id: gm._id },
              update: {
                $set: {
                  [`messageStatus.${statusIndex}.status`]: "delivered",
                  [`messageStatus.${statusIndex}.deliveredAt`]: new Date(),
                },
              },
            },
          });
        }
      }
      if (bulkOps.length > 0) {
        await Message.bulkWrite(bulkOps);
      }
      // Refetch updated messages for emission
      const updatedGroupMessages = await Message.find({
        _id: { $in: groupMessages.map((gm) => gm._id) },
      }).lean();
      for (const ugm of updatedGroupMessages) {
        socket.emit("group:receive", ugm);
        const groupId = ugm.group.toString();
        io.to(`group_${groupId}`).emit("group:status", {
          groupId,
          messageId: ugm._id,
          updatedBy: userIdStr,
          status: {
            [userIdStr]: {
              status: "delivered",
              deliveredAt: new Date().toISOString(),
              user: null, // Can fetch if needed, but to match original
            },
          },
        });
      }
      console.log(
        `Delivered ${groupMessages.length} pending group messages to user ${userId}`
      );
    }
  } catch (err) {
    console.error("Error in connection handler:", err);
  }
}

module.exports = { setupOnConnect };
