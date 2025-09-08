require("dotenv").config();
const express = require("express");
const http = require("http");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const cookieParser = require("cookie-parser");
const { Server } = require("socket.io");
const { connectDB } = require("./config/db");
const { errorHandler } = require("./middleware/errorHandler");
const { initializeLogger, stream } = require("./utils/logger");
const { sanitizeRequest } = require("./utils/validation");
const { apiLimiter, authLimiter } = require("./middleware/rateLimiter");
const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/users");
const messageRoutes = require("./routes/message");
const { initializeSocket } = require("./sockets");
const { auth } = require("./middleware/auth");

(async () => {
  // Initialize logger
  const logger = await initializeLogger();

  // Initialize express app
  const app = express();
  const server = http.createServer(app);

  // Database connection
  await connectDB();

  // Trust proxy (if behind a reverse proxy like Nginx)
  app.set("trust proxy", 1);

  // Security middleware
  app.use(helmet());
  app.use(
    cors({
      origin: process.env.CLIENT_URL || "*",
      credentials: true,
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
    }),
  );

  // Request logging
  app.use(morgan("combined", { stream }));

  // Body parser
  app.use(express.json({ limit: "10kb" }));
  app.use(express.urlencoded({ extended: true, limit: "10kb" }));

  // Cookie parser
  app.use(cookieParser());

  // Sanitize request data
  app.use(sanitizeRequest);

  // Rate limiting
  app.use(apiLimiter);

  // Health check endpoint
  app.get("/api/health", (req, res) => {
    res.status(200).json({
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });

  // API routes
  app.use("/api/auth", authLimiter, authRoutes);
  app.use("/api/users", auth, userRoutes);
  app.use("/api/message", auth, messageRoutes);

  // 404 handler
  app.use((req, res, next) => {
    res.status(404).json({
      success: false,
      message: "Not Found",
      error: {
        code: 404,
        message: `Cannot ${req.method} ${req.path}`,
      },
    });
  });

  // Error handling middleware
  app.use(errorHandler);

  // Initialize Socket.IO
  const io = initializeSocket(server);
  app.set("io", io);

  // Handle unhandled promise rejections
  process.on("unhandledRejection", (reason, promise) => {
    logger.error("Unhandled Rejection at:", promise, "reason:", reason);
  });

  // Handle uncaught exceptions
  process.on("uncaughtException", (error) => {
    logger.error("Uncaught Exception:", error);
  });

  // Handle SIGTERM (for Docker/Heroku)
  process.on("SIGTERM", () => {
    logger.info("SIGTERM received. Shutting down gracefully");
    server.close(() => {
      logger.info("Process terminated");
      process.exit(0);
    });
  });

  // Start server
  const PORT = process.env.PORT || 3001;
  const NODE_ENV = process.env.NODE_ENV || "development";

  server.listen(PORT, () => {
    logger.info(`Server running in ${NODE_ENV} mode on port ${PORT}`);

    // Log important configuration
    logger.info(`Database: ${process.env.MONGODB_URI}`);
    logger.info(`Client URL: ${process.env.CLIENT_URL || "Not set"}`);
    logger.info(`Environment: ${NODE_ENV}`);
  });

  module.exports = { app, server };
})();
