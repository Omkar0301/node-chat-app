const { connections } = require("../../store");
const { checkGroupMembership, isValidObjectId } = require("./helper");
const Group = require("../../../models/Group");
const User = require("../../../models/User");
const { UnauthorizedError } = require("../../../utils/errors");

function registerGroupMembershipHandlers(io, socket) {
  // Join group
  socket.on("joinGroup", async (groupId, callback) => {
    try {
      if (!groupId) {
        throw new Error("Group ID is required");
      }
      const { group } = await checkGroupMembership(groupId, socket.user._id);
      await socket.join(`group_${groupId}`);
      console.log(
        `User ${socket.user._id} successfully joined group_${groupId}`,
      );
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

  // Allow user to exit a group
  socket.on("group:exit", async ({ groupId }, callback) => {
    try {
      const { group, isCreator } = await checkGroupMembership(
        groupId,
        socket.user._id,
        false,
      );
      if (isCreator) {
        throw new Error(
          "Group creator cannot exit the group. Please delete the group or transfer ownership first.",
        );
      }
      await Group.findByIdAndUpdate(groupId, {
        $pull: { members: socket.user._id, admins: socket.user._id },
      });
      await User.findByIdAndUpdate(socket.user._id, {
        $pull: { groups: groupId },
      });
      socket.leave(`group_${groupId}`);
      io.to(`group_${groupId}`).emit("group:memberLeft", {
        groupId,
        userId: socket.user._id,
        userName:
          socket.user.fullName ||
          `${socket.user.firstName} ${socket.user.lastName}`.trim(),
        firstName: socket.user.firstName,
        lastName: socket.user.lastName,
        timestamp: new Date().toISOString(),
      });
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
      if (!isValidObjectId(userId)) {
        throw new Error("Invalid userId");
      }
      const { group } = await checkGroupMembership(
        groupId,
        socket.user._id,
        true,
      );
      if (!group.members.some((member) => member.toString() === userId)) {
        throw new Error("User is not a member of this group");
      }
      if (group.createdBy.toString() === userId) {
        throw new Error("Cannot remove group creator");
      }
      await Group.findByIdAndUpdate(groupId, {
        $pull: { members: userId, admins: userId },
      });
      await User.findByIdAndUpdate(userId, { $pull: { groups: groupId } });
      const userSocketIds = connections.get(userId.toString());
      if (userSocketIds) {
        userSocketIds.forEach((socketId) => {
          if (io.sockets.sockets.has(socketId)) {
            io.to(socketId).emit("group:removed", { groupId });
            io.sockets.sockets.get(socketId)?.leave(`group_${groupId}`);
          }
        });
      }
      // Get the removed user's details
      const removedUser =
        await User.findById(userId).select("firstName lastName");

      io.to(`group_${groupId}`).emit("group:memberRemoved", {
        groupId,
        removedUserId: userId,
        removedBy: socket.user._id,
        removedByUser: {
          id: socket.user._id,
          firstName: socket.user.firstName,
          lastName: socket.user.lastName,
          username: socket.user.username,
        },
        removedUser: {
          id: userId,
          firstName: removedUser?.firstName,
          lastName: removedUser?.lastName,
          username: removedUser?.username,
        },
      });
      callback?.({ success: true });
    } catch (error) {
      console.error("Error removing member from group:", error);
      callback?.({ success: false, error: error.message });
    }
  });

  socket.on("group:addMembers", async ({ groupId, newMembers }, callback) => {
    try {
      if (!Array.isArray(newMembers) || newMembers.length === 0) {
        throw new Error("newMembers must be a non-empty array");
      }
      if (newMembers.some((m) => !isValidObjectId(m))) {
        throw new Error("Invalid member ID");
      }
      const { group } = await checkGroupMembership(
        groupId,
        socket.user._id,
        true,
      );
      const currentMembers = new Set(group.members.map((m) => m.toString()));
      newMembers.forEach((m) => currentMembers.add(m.toString()));
      const updatedMembers = Array.from(currentMembers);
      group.members = updatedMembers;
      await group.save();
      await User.updateMany(
        { _id: { $in: newMembers } },
        { $addToSet: { groups: group._id } },
      );
      // Get the details of the user who added the members
      const addedByUser = {
        id: socket.user._id,
        username: socket.user.username,
        firstName: socket.user.firstName,
        lastName: socket.user.lastName,
        profilePicture: socket.user.profilePicture,
      };

      // Get details of newly added members
      const addedMembers = await User.find({ _id: { $in: newMembers } })
        .select("username firstName lastName profilePicture")
        .lean();

      // Join new members to the group room
      newMembers.forEach((memberId) => {
        const memberSocketIds = connections.get(memberId.toString());
        if (memberSocketIds) {
          memberSocketIds.forEach((socketId) => {
            if (io.sockets.sockets.has(socketId)) {
              io.to(socketId).socketsJoin(`group_${group._id}`);
            }
          });
        }
      });

      // Emit event with detailed user information
      io.to(`group_${group._id}`).emit("group:membersUpdated", {
        groupId: group._id,
        addedBy: addedByUser,
        addedMembers: addedMembers.map((member) => ({
          id: member._id,
          username: member.username,
          firstName: member.firstName,
          lastName: member.lastName,
          profilePicture: member.profilePicture,
        })),
      });
      callback?.({ success: true });
    } catch (err) {
      console.error("Error adding members:", err);
      callback?.({ success: false, error: err.message });
    }
  });
}

module.exports = { registerGroupMembershipHandlers };
