const asyncHandler = require("express-async-handler");
const User = require("../models/User");
const { NotFoundError, BadRequestError } = require("../utils/errors");
const { uploadToCloudinary } = require("../services/cloudinary");

// Get all users (except current user)
const getUsers = asyncHandler(async (req, res) => {
  const users = await User.find({ _id: { $ne: req.user.userId } })
    .select("-password -refreshToken")
    .sort({ online: -1, username: 1 });

  res.json({
    success: true,
    count: users.length,
    data: users,
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
        ],
      },
    ],
  })
    .select("-password -refreshToken")
    .limit(20);

  res.json({
    success: true,
    count: users.length,
    data: users,
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
          select: "username email profilePicture online lastSeen fullName _id",
        },
        {
          path: "admins",
          select: "username email profilePicture online lastSeen fullName _id",
        },
      ],
    });

  if (!user) {
    throw new NotFoundError("User not found");
  }
  const responseUser = user.toObject();
  responseUser.id = responseUser._id;
  delete responseUser._id;

  responseUser.groups = responseUser.groups.map((group) => {
    const g = { ...group };
    g.id = g._id;
    delete g._id;
    delete g.__v;
    return g;
  });

  res.json({
    success: true,
    data: responseUser,
  });
});

// Update user profile
const updateProfile = asyncHandler(async (req, res) => {
  const updates = {};
  const { username, email } = req.body;

  if (username) updates.username = username;
  if (email) {
    const existingUser = await User.findOne({ email });
    if (existingUser && existingUser._id.toString() !== req.user.userId) {
      throw new BadRequestError("Email already in use");
    }
    updates.email = email;
  }

  const user = await User.findByIdAndUpdate(
    req.user.userId,
    { $set: updates },
    { new: true, runValidators: true },
  ).select("-password -refreshToken");

  res.json({
    success: true,
    data: user,
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

module.exports = {
  getUsers,
  searchUsers,
  getUserById,
  updateProfile,
  changePassword,
  uploadProfilePicture,
  deleteAccount,
};
