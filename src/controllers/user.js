const asyncHandler = require("express-async-handler");
const User = require("../models/User");
const { NotFoundError, BadRequestError } = require("../utils/errors");
const { uploadToCloudinary } = require("../services/cloudinary");

// Get all users (except current user)
const getUsers = asyncHandler(async (req, res) => {
  const users = await User.find({ _id: { $ne: req.user.userId } })
    .select("-password -refreshToken -__v -groups")
    .sort({ online: -1, username: 1 });

  const formattedUsers = users.map((user) => ({
    id: user._id,
    username: user.username,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    profilePicture: user.profilePicture,
    online: user.online,
    lastSeen: user.lastSeen,
  }));

  res.json({
    success: true,
    count: formattedUsers.length,
    data: formattedUsers,
  });
});

// Search users
const searchUsers = asyncHandler(async (req, res) => {
  const { query } = req.query;

  const users = await User.find({
    $and: [
      { _id: { $ne: req.user.userId } },
      {
        $or: [
          { username: { $regex: query, $options: "i" } },
          { email: { $regex: query, $options: "i" } },
          { firstName: { $regex: query, $options: "i" } },
          { lastName: { $regex: query, $options: "i" } },
        ],
      },
    ],
  })
    .select("-password -refreshToken -__v -groups")
    .limit(20);

  const formattedUsers = users.map((user) => ({
    id: user._id,
    username: user.username,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    profilePicture: user.profilePicture,
    online: user.online,
    lastSeen: user.lastSeen,
  }));

  res.json({
    success: true,
    count: formattedUsers.length,
    data: formattedUsers,
  });
});

// Get user by ID
const getUserById = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id)
    .select("-password -refreshToken -__v")
    .populate({
      path: "groups",
      select: "-__v",
      populate: [
        {
          path: "members",
          select:
            "username email profilePicture online lastSeen firstName lastName _id",
        },
        {
          path: "admins",
          select:
            "username email profilePicture online lastSeen firstName lastName _id",
        },
      ],
    });

  if (!user) {
    throw new NotFoundError("User not found");
  }

  const responseUser = {
    id: user._id,
    username: user.username,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    profilePicture: user.profilePicture,
    online: user.online,
    lastSeen: user.lastSeen,
    groups: user.groups.map((group) => {
      const g = group.toObject ? group.toObject() : { ...group };
      g.id = g._id;
      delete g._id;
      delete g.__v;

      // Format members
      if (g.members) {
        g.members = g.members.map((member) => {
          const m = member._doc ? member._doc : member;
          const formattedMember = {
            id: m._id || m.id,
            username: m.username,
            email: m.email,
            firstName: m.firstName,
            lastName: m.lastName,
            profilePicture: m.profilePicture,
            online: m.online,
            lastSeen: m.lastSeen,
          };
          return formattedMember;
        });
      }

      // Format admins
      if (g.admins) {
        g.admins = g.admins.map((admin) => {
          const a = admin._doc ? admin._doc : admin;
          const formattedAdmin = {
            id: a._id || a.id,
            username: a.username,
            email: a.email,
            firstName: a.firstName,
            lastName: a.lastName,
            profilePicture: a.profilePicture,
            online: a.online,
            lastSeen: a.lastSeen,
          };
          return formattedAdmin;
        });
      }

      return g;
    }),
  };

  res.json({
    success: true,
    data: responseUser,
  });
});

// Update user profile picture
const updateProfilePicture = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new BadRequestError("No file uploaded");
  }

  let profilePictureUrl;
  try {
    const result = await uploadToCloudinary(req.file.path);
    profilePictureUrl = result.secure_url;
  } catch (error) {
    console.error("Error uploading profile picture:", error);
    throw new BadRequestError("Failed to upload profile picture");
  }

  const user = await User.findByIdAndUpdate(
    req.user.userId,
    { $set: { profilePicture: profilePictureUrl } },
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

  // Emit the update to all connected clients
  const io = req.app.get("io");
  if (io) {
    io.emit("user:profilePicUpdated", userResponse);
  }

  res.json({
    success: true,
    data: userResponse,
    message: "Profile picture updated successfully",
  });
});

// Change password
const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  const user = await User.findById(req.user.userId).select("+password");

  if (!user) {
    throw new NotFoundError("User not found");
  }

  // Check current password
  const isMatch = await user.comparePassword(currentPassword);
  if (!isMatch) {
    throw new BadRequestError("Current password is incorrect");
  }

  // Update password
  user.password = newPassword;
  await user.save();

  res.json({
    success: true,
    message: "Password updated successfully",
  });
});

// Upload profile picture
const uploadProfilePicture = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new BadRequestError("Please upload a file");
  }

  // Upload to Cloudinary
  const result = await uploadToCloudinary(req.file.path);

  const user = await User.findByIdAndUpdate(
    req.user.userId,
    { profilePicture: result.secure_url },
    { new: true },
  ).select("-password -refreshToken");

  res.json({
    success: true,
    data: user,
  });
});

// Delete user account
const deleteAccount = asyncHandler(async (req, res) => {
  await User.findByIdAndDelete(req.user.userId);

  res.json({
    success: true,
    message: "Account deleted successfully",
  });
});

// Get current user profile
const getProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.userId).select(
    "-password -refreshToken -__v",
  );

  if (!user) {
    throw new NotFoundError("User not found");
  }

  res.json({
    success: true,
    data: user,
  });
});

module.exports = {
  getUsers,
  searchUsers,
  getUserById,
  getProfile,
  updateProfilePicture,
  changePassword,
  deleteAccount,
};
