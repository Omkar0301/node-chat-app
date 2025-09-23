const User = require("../../../models/User");
const { BadRequestError, NotFoundError } = require("../../../utils/errors");

function registerUserProfileHandlers(io, socket) {
  // Update user profile
  socket.on("user:updateProfile", async (updates, callback) => {
    try {
      const { username, email, firstName, lastName } = updates;
      const userId = socket.user._id.toString();
      const updateFields = {};

      // Only allow updating specific fields
      if (username) updateFields.username = username.trim();
      if (email) {
        const normalizedEmail = email.toLowerCase().trim();
        const existingUser = await User.findOne({ email: normalizedEmail });
        if (existingUser && existingUser._id.toString() !== userId) {
          throw new BadRequestError("Email already in use");
        }
        updateFields.email = normalizedEmail;
      }
      if (firstName !== undefined) updateFields.firstName = firstName.trim();
      if (lastName !== undefined) updateFields.lastName = lastName.trim();

      // Only update if there are changes
      if (Object.keys(updateFields).length === 0) {
        throw new BadRequestError("No valid fields to update");
      }

      const user = await User.findByIdAndUpdate(
        userId,
        { $set: updateFields },
        { new: true, runValidators: true },
      )
        .select("-password -refreshToken -__v")
        .lean();

      if (!user) {
        throw new NotFoundError("User not found");
      }

      // Format the response
      const userResponse = {
        id: user._id,
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        profilePicture: user.profilePicture,
        online: user.online,
        lastSeen: user.lastSeen,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      };

      // Emit to all connected clients that the user's profile was updated
      io.emit("user:profileUpdated", userResponse);
    } catch (error) {
      console.error("Error updating profile:", error);
      callback?.({
        success: false,
        error: error.message || "Failed to update profile",
      });
    }
  });
}

module.exports = { registerUserProfileHandlers };
