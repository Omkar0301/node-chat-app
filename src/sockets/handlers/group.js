const Message = require("../../models/Message");
const Group = require("../../models/Group");
const User = require("../../models/User");
const { UnauthorizedError } = require("../../utils/errors");
const { connections } = require("../store");

function registerGroupHandlers(io, socket) {
  // Join group
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
      console.log(`User ${socket.userId} successfully joined group_${groupId}`);

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

  // Group message handler
  socket.on("group:send", async (data, callback) => {
    try {
      const { groupId, content, attachments, replyTo } = data || {};
      if (!groupId) throw new Error("groupId required");

      const group = await Group.findById(groupId);
      if (!group) throw new UnauthorizedError("Group not found");

      const isMember = (group.members || [])
        .map((m) => m.toString())
        .includes(socket.userId);
      if (!isMember) throw new UnauthorizedError("Not a member of this group");

      // Ensure the socket is in the group room
      if (!socket.rooms.has(`group_${groupId}`)) {
        socket.join(`group_${groupId}`);
        console.log(
          `User ${socket.userId} joined group_${groupId} via group:send`,
        );
      }

      // Prepare per-recipient status for group members (exclude sender)
      const memberIds = (group.members || [])
        .map((m) => m.toString())
        .filter((id) => id !== socket.userId);

      const message = new Message({
        sender: socket.user._id,
        group: groupId,
        content: content || "",
        type: "group",
        status: "sent",
        attachments: attachments || [],
        replyTo: replyTo || null,
        messageStatus: memberIds.map((id) => ({ user: id, status: "sent" })),
      });

      await message.save();

      // Deliver to online members immediately and mark as delivered for them
      for (const memberId of memberIds) {
        const memberSocketId = connections.get(memberId);
        if (memberSocketId) {
          // Update this member's delivery status
          await Message.updateOne(
            { _id: message._id, "messageStatus.user": memberId },
            {
              $set: {
                "messageStatus.$.status": "delivered",
                "messageStatus.$.deliveredAt": new Date(),
              },
            },
          );
          // Send the message to the member's user room (covers multiple tabs/devices)
          io.to(`user_${memberId}`).emit("group:receive", message);

          // Notify the sender about delivery to this member
          // Get user details for the member
          const member = await User.findById(memberId, {
            username: 1,
            email: 1,
            profilePicture: 1,
            online: 1,
            lastSeen: 1,
          });

          io.to(`user_${socket.userId}`).emit("group:status", {
            groupId,
            messageId: message._id,
            updatedBy: memberId,
            status: {
              [memberId]: {
                status: "delivered",
                deliveredAt: new Date().toISOString(),
                user: member ? member.getPublicProfile() : null,
              },
            },
          });
        }
      }

      // Acknowledge to sender with the saved message
      socket.emit("group:sent", message);

      callback?.({ success: true, data: message });
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

      const group = await Group.findById(groupId);
      if (!group) {
        throw new Error("Group not found");
      }

      const currentUserId = socket.user._id.toString();
      const isMember = group.members.some(
        (member) => member.toString() === currentUserId,
      );
      if (!isMember) {
        throw new UnauthorizedError("You are not a member of this group");
      }

      // Fetch user details for all group members to include in status
      const users = await User.find(
        { _id: { $in: group.members } },
        { username: 1, email: 1, profilePicture: 1, online: 1, lastSeen: 1 },
      );
      const userMap = new Map(
        users.map((u) => [u._id.toString(), u.getPublicProfile()]),
      );

      for (const messageId of messageIds) {
        const message = await Message.findOne({
          _id: messageId,
          group: groupId,
          type: "group",
        });
        if (!message) continue;

        const statusIndex = message.messageStatus.findIndex(
          (s) => s.user.toString() === currentUserId,
        );
        if (
          statusIndex === -1 ||
          message.messageStatus[statusIndex].status === "read"
        ) {
          continue; // Not applicable or already read
        }

        // Update to read
        const now = new Date();
        message.messageStatus[statusIndex].status = "read";
        message.messageStatus[statusIndex].readAt = now;

        // Add to readBy if not already
        if (!message.readBy.some((u) => u.toString() === currentUserId)) {
          message.readBy.push(socket.user._id);
        }

        await message.save();

        // Compute full status details with user objects
        const readBy = message.messageStatus
          .filter((s) => s.status === "read")
          .map((s) => userMap.get(s.user.toString()));
        const deliveredTo = message.messageStatus
          .filter((s) => s.status === "delivered")
          .map((s) => userMap.get(s.user.toString()));
        const sentTo = message.messageStatus
          .filter((s) => s.status === "sent")
          .map((s) => userMap.get(s.user.toString()));

        // Emit updated status to the group room with full details
        io.to(`group_${groupId}`).emit("group:status", {
          groupId,
          messageId: message._id,
          updatedBy: currentUserId,
          updatedAt: now.toISOString(),
          status: {
            // Combine all statuses into a single object with full user details
            ...readBy.reduce(
              (acc, user) => ({
                ...acc,
                [user._id]: {
                  status: "read",
                  readAt: now.toISOString(),
                  user: user, // Include full user object
                },
              }),
              {},
            ),
            ...deliveredTo.reduce(
              (acc, user) => ({
                ...acc,
                [user._id]: {
                  status: "delivered",
                  deliveredAt: now.toISOString(),
                  user: user, // Include full user object
                },
              }),
              {},
            ),
            ...sentTo.reduce(
              (acc, user) => ({
                ...acc,
                [user._id]: {
                  status: "sent",
                  sentAt: now.toISOString(),
                  user: user, // Include full user object
                },
              }),
              {},
            ),
          },
        });
      }

      callback?.({ success: true });
    } catch (error) {
      console.error("Error processing group read receipts:", error);
      callback?.({
        success: false,
        error: error.message || "Failed to process read receipts",
      });
    }
  });

  // Group creation & management
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
        const memberSocketId = connections.get(memberId.toString());
        if (memberSocketId) {
          io.to(memberSocketId).socketsJoin(`group_${group._id}`);
        }
      });

      io.to(`group_${group._id}`).emit("group:created", group);
      callback({ success: true, data: group });
    } catch (error) {
      console.error("Error creating group:", error);
      callback({ success: false, error: "Failed to create group" });
    }
  });

  socket.on("group:addMembers", async ({ groupId, newMembers }, callback) => {
    try {
      const group = await Group.findById(groupId);
      if (!group) throw new Error("Group not found");
      if (group.createdBy.toString() !== socket.userId)
        throw new UnauthorizedError("Not authorized");

      const currentMembers = new Set(group.members.map((m) => m.toString()));
      newMembers.forEach((m) => currentMembers.add(m.toString()));
      const updatedMembers = Array.from(currentMembers);
      group.members = updatedMembers;
      await group.save();

      await User.updateMany(
        { _id: { $in: newMembers } },
        { $addToSet: { groups: group._id } },
      );

      newMembers.forEach((memberId) => {
        const memberSocketId = connections.get(memberId.toString());
        if (memberSocketId) {
          io.to(memberSocketId).socketsJoin(`group_${group._id}`);
        }
      });

      io.to(`group_${group._id}`).emit("group:membersUpdated", group);
      callback({ success: true, data: group });
    } catch (err) {
      console.error("Error adding members:", err);
      callback({ success: false, error: err.message });
    }
  });

  socket.on("group:rename", async ({ groupId, name }, callback) => {
    try {
      if (!groupId) throw new Error("groupId required");
      if (typeof name !== "string") throw new Error("name must be a string");
      const trimmed = name.trim();
      if (!trimmed) throw new Error("Group name cannot be empty");
      if (trimmed.length > 50)
        throw new Error("Group name cannot be longer than 50 characters");

      const group = await Group.findById(groupId);
      if (!group) throw new Error("Group not found");

      const userIdStr = socket.user._id.toString();
      const isMember = (group.members || [])
        .map((m) => m.toString())
        .includes(userIdStr);

      if (!isMember) throw new UnauthorizedError("Not a member of this group");

      if (group.name === trimmed) {
        callback?.({ success: true, data: group });
        return;
      }

      group.name = trimmed;
      await group.save();

      const payload = {
        groupId: group._id,
        name: group.name,
        updatedBy: socket.user._id,
        updatedAt: new Date().toISOString(),
      };

      io.to(`group_${groupId}`).emit("group:nameUpdated", payload);
      callback?.({ success: true, data: group });
    } catch (error) {
      console.error("Error renaming group:", error);
      callback?.({ success: false, error: error.message });
    }
  });

  socket.on("group:delete", async ({ groupId }, callback) => {
    try {
      const group = await Group.findById(groupId);
      if (!group || group.createdBy.toString() !== socket.user._id.toString())
        throw new UnauthorizedError("Not authorized to delete group");

      await Group.deleteOne({ _id: groupId });
      await User.updateMany(
        { _id: { $in: group.members } },
        { $pull: { groups: groupId } },
      );

      group.members.forEach((memberId) => {
        const memberSocketId = connections.get(memberId.toString());
        if (memberSocketId) {
          io.to(memberSocketId).emit("group:deleted", { groupId: group._id });
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
        $pull: { members: userId, admins: userId },
      });

      // Remove group from user's groups
      await User.findByIdAndUpdate(userId, { $pull: { groups: groupId } });

      // Get user's socket ID if online
      const userSocketId = connections.get(userId.toString());
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

  // Delete a group message (for everyone by sender/admin or for self only)
  socket.on("group:message:delete", async (data, callback) => {
    try {
      const { groupId, messageId, forEveryone } = data || {};
      if (!groupId || !messageId) {
        return callback?.({
          success: false,
          error: "groupId and messageId required",
        });
      }

      const group = await Group.findById(groupId);
      if (!group)
        return callback?.({ success: false, error: "Group not found" });

      const currentUserId = socket.user._id.toString();
      const isMember = (group.members || []).some(
        (m) => m.toString() === currentUserId,
      );
      if (!isMember)
        return callback?.({ success: false, error: "Not a group member" });

      const message = await Message.findOne({
        _id: messageId,
        group: groupId,
        type: "group",
      });
      if (!message)
        return callback?.({ success: false, error: "Message not found" });

      if (forEveryone) {
        const isAdmin = (group.admins || []).some(
          (a) => a.toString() === currentUserId,
        );
        const isCreator = group.createdBy?.toString() === currentUserId;
        const isSender = message.sender.toString() === currentUserId;
        if (!(isSender || isAdmin || isCreator)) {
          return callback?.({
            success: false,
            error: "Only sender or admin can delete for everyone",
          });
        }
        if (!message.isDeleted) {
          message.isDeleted = true;
          message.deletedAt = new Date();
          message.deletedBy = socket.user._id;
          await message.save();
        }

        // Broadcast to the group room
        io.to(`group_${groupId}`).emit("group:messageDeleted", {
          groupId,
          messageId: message._id,
          forEveryone: true,
          deletedBy: currentUserId,
          deletedAt: message.deletedAt,
        });
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
        // Notify only the requester (their client should remove it locally)
        io.to(`user_${currentUserId}`).emit("group:messageHidden", {
          groupId,
          messageId: message._id,
          forEveryone: false,
        });
        return callback?.({ success: true });
      }
    } catch (error) {
      console.error("Error deleting group message:", error);
      callback?.({
        success: false,
        error: error.message || "Failed to delete message",
      });
    }
  });

  // Clear a group chat for self only (hide all existing messages for the user)
  socket.on("group:chat:clear", async (data, callback) => {
    try {
      const { groupId } = data || {};
      if (!groupId)
        return callback?.({ success: false, error: "groupId required" });

      const group = await Group.findById(groupId);
      if (!group)
        return callback?.({ success: false, error: "Group not found" });

      const currentUserId = socket.user._id;
      const isMember = (group.members || []).some(
        (m) => m.toString() === currentUserId.toString(),
      );
      if (!isMember)
        return callback?.({ success: false, error: "Not a group member" });

      const res = await Message.updateMany(
        { group: groupId, type: "group", deletedFor: { $ne: currentUserId } },
        { $addToSet: { deletedFor: currentUserId } },
      );

      io.to(`user_${currentUserId.toString()}`).emit("group:chatCleared", {
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

module.exports = { registerGroupHandlers };
