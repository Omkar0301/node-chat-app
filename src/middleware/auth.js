const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { UnauthorizedError } = require("../utils/errors");

const auth = async (req, res, next) => {
  try {
    let token;

    // Check Authorization header first
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.split(" ")[1];
    }
    // If no token in header, check cookies
    else if (req.cookies?.token) {
      token = req.cookies.token;
    }

    if (!token) {
      return next(new UnauthorizedError("No authentication token provided"));
    }

    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      // Verify the user exists
      const user = await User.findById(payload.userId).select("-password");
      if (!user) {
        return next(new UnauthorizedError("User not found"));
      }

      // Attach the user to the request object
      req.user = { userId: payload.userId };
      next();
    } catch (error) {
      if (error.name === "JsonWebTokenError") {
        return next(new UnauthorizedError("Invalid token"));
      }
      if (error.name === "TokenExpiredError") {
        return next(new UnauthorizedError("Token expired"));
      }
      return next(new UnauthorizedError("Authentication failed"));
    }
  } catch (error) {
    return next(error);
  }
};

const socketAuth = async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error("Authentication error: No token provided"));
    }

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.userId);

    if (!user) {
      return next(new Error("Authentication error: User not found"));
    }

    // Attach user to socket
    socket.user = user;
    next();
  } catch (error) {
    console.error("Socket authentication error:", error.message);
    next(new Error("Authentication error"));
  }
};

module.exports = { auth, socketAuth };
