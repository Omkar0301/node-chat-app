const Group = require("../../../models/Group");
const User = require("../../../models/User");
const { connections } = require("../../store");
const { checkGroupMembership, isValidObjectId } = require("./helper");
const { UnauthorizedError } = require("../../../utils/errors");
const { default: mongoose } = require("mongoose");
const { deleteFromCloudinary } = require("../../../services/cloudinary");

function registerGroupManagementHandlers(io, socket) {
  // Group creation
  socket.on("group:create", async (groupData, callback) => {
    try {
      const { name, members } = groupData || {};
      if (!name || typeof name !== "string" || name.trim().length === 0) {
        throw new Error("Valid group name required");
      }
      const membersSet = new Set([
        socket.user._id.toString(),
        ...(Array.isArray(members)
          ? members.filter(isValidObjectId).map((m) => m.toString())
          : []),
      ]);
      const membersArray = Array.from(membersSet);
      const group = new Group({
        name: name.trim(),
        createdBy: socket.user._id,
        admins: [socket.user._id], // Add creator as admin
        members: membersArray,
      });
      await group.save();
      await User.updateMany(
        { _id: { $in: membersArray } },
        { $addToSet: { groups: group._id } }
      );
      membersArray.forEach((memberId) => {
        const memberSocketIds = connections.get(memberId.toString());
        if (memberSocketIds) {
          memberSocketIds.forEach((socketId) => {
            if (io.sockets.sockets.has(socketId)) {
              io.to(socketId).socketsJoin(`group_${group._id}`);
            }
          });
        }
      });
      // Get user details for the response
      const userDetails = {
        _id: socket.user._id,
        username: socket.user.username,
        email: socket.user.email,
        profilePicture: socket.user.profilePicture,
        firstName: socket.user.firstName,
        lastName: socket.user.lastName,
        online: true,
      };

      // Add user details to the group response
      const groupResponse = group.toObject();
      groupResponse.members = group.members.map((member) => {
        // Handle case where member is just an ObjectId
        if (
          typeof member === "string" ||
          member instanceof mongoose.Types.ObjectId
        ) {
          return member.toString() === socket.user._id.toString()
            ? { _id: socket.user._id, ...userDetails }
            : { _id: member };
        }

        // Handle case where member is a populated user document
        if (member._id) {
          return member._id.toString() === socket.user._id.toString()
            ? {
                ...(member.toObject ? member.toObject() : member),
                ...userDetails,
              }
            : member.toObject
              ? member.toObject()
              : member;
        }

        return member;
      });

      io.to(`group_${group._id}`).emit("group:created", groupResponse);
      callback?.({ success: true, data: groupResponse });
    } catch (error) {
      console.error("Error creating group:", error);
      callback?.({ success: false, error: "Failed to create group" });
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
      const { group } = await checkGroupMembership(
        groupId,
        socket.user._id,
        false
      ); // Not Require admin
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
      const { group } = await checkGroupMembership(groupId, socket.user._id);
      if (group.createdBy.toString() !== socket.user._id.toString()) {
        throw new UnauthorizedError("Not authorized to delete group");
      }

      // Delete group photo if it exists
      if (group.photo) {
        try {
          await deleteFromCloudinary(group.photo);
        } catch (error) {
          console.error("Error deleting group photo:", error);
        }
      }

      await Group.deleteOne({ _id: groupId });
      await User.updateMany(
        { _id: { $in: group.members } },
        { $pull: { groups: groupId } }
      );
      group.members.forEach((memberId) => {
        const memberSocketIds = connections.get(memberId.toString());
        if (memberSocketIds) {
          memberSocketIds.forEach((socketId) => {
            if (io.sockets.sockets.has(socketId)) {
              io.to(socketId).emit("group:deleted", { groupId: group._id });
            }
          });
        }
      });
      io.in(`group_${group._id}`).socketsLeave(`group_${group._id}`);
      callback?.({ success: true });
    } catch (error) {
      callback?.({ success: false, error: error.message });
    }
  });
}

module.exports = { registerGroupManagementHandlers };
