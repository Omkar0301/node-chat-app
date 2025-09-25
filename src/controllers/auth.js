const jwt = require("jsonwebtoken");
const asyncHandler = require("express-async-handler");
const User = require("../models/User");
const { ConflictError, UnauthorizedError, BadRequestError } = require("../utils/errors");
const { uploadToCloudinary } = require("../services/cloudinary");
const fs = require("fs");
const path = require("path");

// Generate JWT token
const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: "1d",
  });
};

// Generate refresh token
const generateRefreshToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: "7d",
  });
};

// Register a new user
const register = asyncHandler(async (req, res) => {
  const { username, email, password, firstName, lastName } = req.body;
  let profilePictureUrl = '';

  // Check if user already exists
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    // If a file was uploaded but user exists, clean it up
    if (req.file) {
      try {
        await fs.promises.unlink(req.file.path);
      } catch (error) {
        console.error('Error cleaning up uploaded file:', error);
      }
    }
    throw new ConflictError("User already exists with this email");
  }

  // Handle profile picture upload if file exists
  if (req.file) {
    try {
      const filePath = path.normalize(req.file.path);
      
      // Verify file exists before uploading
      if (!fs.existsSync(filePath)) {
        throw new BadRequestError("Error processing the uploaded file");
      }

      // Upload to Cloudinary
      const result = await uploadToCloudinary(filePath);
      
      if (!result?.secure_url) {
        throw new Error("Failed to upload profile picture");
      }
      
      profilePictureUrl = result.secure_url;
      
      // Delete the temporary file after upload
      try {
        await fs.promises.unlink(filePath);
      } catch (error) {
        console.error('Error deleting temporary file:', error);
      }
    } catch (error) {
      // Clean up the file if there was an error
      if (req.file?.path) {
        try {
          await fs.promises.unlink(req.file.path);
        } catch (err) {
          console.error('Error cleaning up file after upload error:', err);
        }
      }
      throw new BadRequestError("Error processing profile picture: " + error.message);
    }
  }

  // Create user
  const user = new User({
    username,
    email,
    password,
    firstName,
    lastName,
    profilePicture: profilePictureUrl || '',
  });

  await user.save();

  // Generate tokens
  const token = generateToken(user._id);
  const refreshToken = generateRefreshToken(user._id);

  // Save refresh token to user
  user.refreshToken = refreshToken;
  await user.save();

  // Set HTTP-only cookies
  res.cookie("token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 24 * 60 * 60 * 1000, // 1 day
  });

  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });

  res.status(201).json({
    success: true,
    data: {
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        profilePicture: user.profilePicture,
      },
    },
  });
});

// Login user
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  // Check if user exists
  const user = await User.findOne({ email }).select("+password");
  if (!user) {
    throw new UnauthorizedError("Invalid credentials");
  }

  // Check password
  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    throw new UnauthorizedError("Invalid credentials");
  }

  // Generate tokens
  const token = generateToken(user._id);
  const refreshToken = generateRefreshToken(user._id);

  // Save refresh token to user
  user.refreshToken = refreshToken;
  user.online = true;
  await user.save();

  // Set HTTP-only cookies
  res.cookie("token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 24 * 60 * 60 * 1000, // 1 day
  });

  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });

  res.json({
    success: true,
    data: {
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        profilePicture: user.profilePicture,
      },
      token,
    },
  });
});

// Get current user
const getMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.userId).select(
    "-password -refreshToken -__v",
  );

  const userResponse = {
    id: user._id,
    username: user.username,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    profilePicture: user.profilePicture,
    online: user.online,
    lastSeen: user.lastSeen,
  };

  res.json({
    success: true,
    data: userResponse,
  });
});

// Refresh token
const refreshToken = asyncHandler(async (req, res) => {
  const { refreshToken } = req.cookies;

  if (!refreshToken) {
    throw new UnauthorizedError("No refresh token provided");
  }

  try {
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const user = await User.findById(decoded.userId);

    if (!user || user.refreshToken !== refreshToken) {
      throw new UnauthorizedError("Invalid refresh token");
    }

    // Generate new tokens
    const newToken = generateToken(user._id);
    const newRefreshToken = generateRefreshToken(user._id);

    // Update refresh token in database
    user.refreshToken = newRefreshToken;
    await user.save();

    // Set new cookies
    res.cookie("token", newToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 24 * 60 * 60 * 1000, // 1 day
    });

    res.cookie("refreshToken", newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    res.json({
      success: true,
      data: {
        token: newToken,
      },
    });
  } catch (error) {
    throw new UnauthorizedError("Invalid refresh token");
  }
});

// Logout user
const logout = asyncHandler(async (req, res) => {
  // Clear cookies
  res.clearCookie("token");
  res.clearCookie("refreshToken");

  // Update user status
  await User.findByIdAndUpdate(req.user.userId, {
    online: false,
    refreshToken: null,
  });

  res.json({
    success: true,
    message: "Successfully logged out",
  });
});

module.exports = {
  register,
  login,
  getMe,
  refreshToken,
  logout,
};
