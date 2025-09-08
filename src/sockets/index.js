const { socketAuth } = require("../middleware/auth");
const Message = require("../models/Message");
const User = require("../models/User");
const Group = require("../models/Group");
const { UnauthorizedError } = require("../utils/errors");

const activeConnections = new Map();

const initializeSocket = (server) => {
  const io = require("socket.io")(server, {
    cors: {
      origin: process.env.CLIENT_URL || "*",
      methods: ["GET", "POST"],
      credentials: true,
    },
    pingTimeout: 10000,
    pingInterval: 25000,
  });

  // Socket.IO middleware
  io.use(socketAuth);

  io.on("connection", async (socket) => {
    try {
      const userIdStr = socket.user._id.toString();
      console.log("User connected:", userIdStr);

      // Add user to active connections
      activeConnections.set(userIdStr, socket.id);
      socket.userId = userIdStr;

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

      // Join personal room
      socket.join(`user_${userIdStr}`);

      // -----------------------
      // Direct message handler
      // -----------------------
      socket.on("message:send", async (data, callback) => {
        try {
          const { to, content, attachments, replyTo } = data || {};
          if (!to)
            return callback({ success: false, error: "Recipient required" });
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
          const recipientSocketId = activeConnections.get(to.toString());
          if (recipientSocketId) {
            message.status = "delivered";
            await message.save();
            io.to(recipientSocketId).emit("message:receive", message);
          }
          // If recipient is offline, the message will be delivered when they come back online
          // through the connection handler above

          // Emit back to sender with current status
          io.to(`user_${userIdStr}`).emit("message:sent", message);

          callback?.({ success: true, data: message });
        } catch (error) {
          console.error("Error sending message:", error);
          callback({ success: false, error: "Failed to send message" });
        }
      });

      // -----------------------
      // Message delivery confirmation
      // -----------------------
      socket.on("message:delivered", async (data) => {
        const { messageId } = data;
        try {
          const message = await Message.findById(messageId);
          if (!message) return;

          if (
            message.recipient &&
            message.recipient.toString() === socket.userId
          ) {
            if (message.status !== "delivered") {
              message.status = "delivered";
              await message.save();
            }

            const senderSocketId = activeConnections.get(
              message.sender.toString(),
            );
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

      // -----------------------
      // Message read receipts
      // -----------------------
      socket.on("message:read", async (data) => {
        try {
          const { messageId } = data;
          const message = await Message.findById(messageId);
          if (
            message &&
            message.recipient.toString() === socket.user._id.toString()
          ) {
            message.status = "read";
            await message.save();
            const senderSocketId = activeConnections.get(
              message.sender.toString(),
            );
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

      // -----------------------
      // Typing indicators
      // -----------------------
      socket.on("typing:start", ({ to }) => {
        if (!to) return;
        const recipientSocketId = activeConnections.get(to.toString());
        if (recipientSocketId) {
          io.to(recipientSocketId).emit("typing:start", {
            from: socket.userId,
          });
        }
      });

      socket.on("typing:stop", ({ to }) => {
        if (!to) return;
        const recipientSocketId = activeConnections.get(to.toString());
        if (recipientSocketId) {
          io.to(recipientSocketId).emit("typing:stop", {
            from: socket.userId,
          });
        }
      });

      // -----------------------
      // Join group
      // -----------------------
      socket.on("joinGroup", async (groupId, callback) => {
        try {
          if (!groupId) {
            throw new Error("Group ID is required");
          }

          const group = await Group.findById(groupId);
          if (!group) {
            throw new Error("Group not found");
          }

          const isMember = group.members.some(
            (member) => member.toString() === socket.user._id.toString(),
          );

          if (!isMember) {
            throw new UnauthorizedError("You are not a member of this group");
          }

          // Join the group room
          await socket.join(`group_${groupId}`);
          console.log(
            `User ${socket.userId} successfully joined group_${groupId}`,
          );

          // Confirm the room was joined
          const rooms = Array.from(socket.rooms);
          console.log(`User ${socket.userId} is now in rooms:`, rooms);

          callback?.({
            success: true,
            groupId,
            message: `Successfully joined group ${group.name}`,
          });
        } catch (error) {
          console.error(`Error joining group ${groupId}:`, error);
          callback?.({
            success: false,
            error: error.message || "Failed to join group",
          });
        }
      });

      // -----------------------
      // Group message handler
      // -----------------------
      socket.on("group:send", async (data, callback) => {
        try {
          const { groupId, content, attachments, replyTo } = data || {};
          if (!groupId) throw new Error("groupId required");

          const group = await Group.findById(groupId);
          if (!group) throw new UnauthorizedError("Group not found");

          const isMember = (group.members || [])
            .map((m) => m.toString())
            .includes(socket.userId);
          if (!isMember)
            throw new UnauthorizedError("Not a member of this group");

          // Ensure the socket is in the group room
          if (!socket.rooms.has(`group_${groupId}`)) {
            socket.join(`group_${groupId}`);
            console.log(
              `User ${socket.userId} joined group_${groupId} via group:send`,
            );
          }

          const message = new Message({
            sender: socket.user._id,
            group: groupId,
            content: content || "",
            type: "group",
            status: "sent",
            attachments: attachments || [],
            replyTo: replyTo || null,
          });

          await message.save();

          io.to(`group_${groupId}`).emit("group:receive", message);
          socket.emit("group:sent", message);

          callback?.({ success: true, data: message });
        } catch (error) {
          console.error("Error sending group message:", error);
          callback({
            success: false,
            error: error.message || "Failed to send group message",
          });
        }
      });

      // -----------------------
      // Group creation & management
      // -----------------------
      socket.on("group:create", async (groupData, callback) => {
        try {
          const { name, members } = groupData || {};
          if (!name)
            return callback({ success: false, error: "Group name required" });

          const membersSet = new Set([
            socket.user._id.toString(),
            ...(Array.isArray(members) ? members.map((m) => m.toString()) : []),
          ]);
          const membersArray = Array.from(membersSet);

          const group = new Group({
            name,
            createdBy: socket.user._id,
            members: membersArray,
          });
          await group.save();

          await User.findByIdAndUpdate(socket.user._id, {
            $addToSet: { groups: group._id },
          });
          await User.updateMany(
            { _id: { $in: membersArray } },
            { $addToSet: { groups: group._id } },
          );

          membersArray.forEach((memberId) => {
            const memberSocketId = activeConnections.get(memberId.toString());
            if (memberSocketId)
              io.to(memberSocketId).socketsJoin(`group_${group._id}`);
          });

          io.to(`group_${group._id}`).emit("group:created", group);
          callback({ success: true, data: group });
        } catch (error) {
          console.error("Error creating group:", error);
          callback({ success: false, error: "Failed to create group" });
        }
      });

      socket.on(
        "group:addMembers",
        async ({ groupId, newMembers }, callback) => {
          try {
            const group = await Group.findById(groupId);
            if (!group) throw new Error("Group not found");
            if (group.createdBy.toString() !== socket.userId)
              throw new UnauthorizedError("Not authorized");

            const currentMembers = new Set(
              group.members.map((m) => m.toString()),
            );
            newMembers.forEach((m) => currentMembers.add(m.toString()));
            const updatedMembers = Array.from(currentMembers);
            group.members = updatedMembers;
            await group.save();

            await User.updateMany(
              { _id: { $in: newMembers } },
              { $addToSet: { groups: group._id } },
            );

            newMembers.forEach((memberId) => {
              const memberSocketId = activeConnections.get(memberId.toString());
              if (memberSocketId)
                io.to(memberSocketId).socketsJoin(`group_${group._id}`);
            });

            io.to(`group_${group._id}`).emit("group:membersUpdated", group);
            callback({ success: true, data: group });
          } catch (err) {
            console.error("Error adding members:", err);
            callback({ success: false, error: err.message });
          }
        },
      );

      socket.on("group:delete", async ({ groupId }, callback) => {
        try {
          const group = await Group.findById(groupId);
          if (
            !group ||
            group.createdBy.toString() !== socket.user._id.toString()
          )
            throw new UnauthorizedError("Not authorized to delete group");

          await Group.deleteOne({ _id: groupId });
          await User.updateMany(
            { _id: { $in: group.members } },
            { $pull: { groups: groupId } },
          );

          group.members.forEach((memberId) => {
            const memberSocketId = activeConnections.get(memberId.toString());
            if (memberSocketId) {
              io.to(memberSocketId).emit("group:deleted", {
                groupId: group._id,
              });
            }
          });

          io.in(`group_${group._id}`).socketsLeave(`group_${group._id}`);
          callback({ success: true });
        } catch (error) {
          callback({ success: false, error: error.message });
        }
      });

      // Allow user to exit a group

      socket.on("group:exit", async ({ groupId }, callback) => {
        try {
          const group = await Group.findById(groupId);
          if (!group) throw new Error("Group not found");

          const isMember = group.members.some(
            (m) => m.toString() === socket.user._id.toString(),
          );
          if (!isMember) {
            throw new UnauthorizedError("You are not a member of this group");
          }

          const isCreator =
            group.createdBy.toString() === socket.user._id.toString();
          if (isCreator) {
            throw new Error(
              "Group creator cannot exit the group. Please delete the group or transfer ownership first.",
            );
          }

          // Remove user from group members & admins
          await Group.findByIdAndUpdate(groupId, {
            $pull: { members: socket.user._id, admins: socket.user._id },
          });

          // Remove group from user's groups
          await User.findByIdAndUpdate(socket.user._id, {
            $pull: { groups: groupId },
          });

          // Leave socket room
          socket.leave(`group_${groupId}`);

          // Notify remaining members
          io.to(`group_${groupId}`).emit("group:memberLeft", {
            groupId,
            userId: socket.user._id,
            userName: socket.user.fullName || socket.user.name,
            timestamp: new Date().toISOString(),
          });

          // Acknowledge to the user who left
          socket.emit("group:left", {
            groupId,
            success: true,
            message: "You have left the group",
          });

          callback?.({ success: true });
        } catch (error) {
          callback?.({ success: false, error: error.message });
        }
      });

      // Allow admin to remove a user from group
      socket.on("group:removeMember", async ({ groupId, userId }, callback) => {
        try {
          const group = await Group.findById(groupId);
          if (!group) {
            throw new Error("Group not found");
          }

          // Check if requester is an admin or creator
          const isAdmin = group.admins.some(
            (admin) => admin.toString() === socket.user._id.toString(),
          );
          const isCreator =
            group.createdBy.toString() === socket.user._id.toString();

          if (!isAdmin && !isCreator) {
            throw new UnauthorizedError("Only group admins can remove members");
          }

          // Check if target user is a member
          if (!group.members.some((member) => member.toString() === userId)) {
            throw new Error("User is not a member of this group");
          }

          // Don't allow removing the creator
          if (group.createdBy.toString() === userId) {
            throw new Error("Cannot remove group creator");
          }

          // Remove user from group members and admins
          await Group.findByIdAndUpdate(groupId, {
            $pull: {
              members: userId,
              admins: userId,
            },
          });

          // Remove group from user's groups
          await User.findByIdAndUpdate(userId, { $pull: { groups: groupId } });

          // Get user's socket ID if online
          const userSocketId = activeConnections.get(userId.toString());
          if (userSocketId) {
            io.to(userSocketId).emit("group:removed", { groupId });
            io.sockets.sockets.get(userSocketId)?.leave(`group_${groupId}`);
          }

          // Notify all group members
          io.to(`group_${groupId}`).emit("group:memberRemoved", {
            groupId,
            removedUserId: userId,
            removedBy: socket.user._id,
          });

          callback({ success: true });
        } catch (error) {
          console.error("Error removing member from group:", error);
          callback({ success: false, error: error.message });
        }
      });

      // -----------------------
      // Disconnect
      // -----------------------
      socket.on("disconnect", async () => {
        console.log("User disconnected:", socket.userId);

        try {
          activeConnections.delete(socket.userId);

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
    } catch (err) {
      console.error("Socket connection setup error:", err);
    }
  });

  return io;
};

module.exports = { initializeSocket };
