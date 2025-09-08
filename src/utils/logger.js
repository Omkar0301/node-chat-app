const winston = require("winston");
const { createLogger, format, transports } = winston;
const { combine, timestamp, printf, colorize, json } = format;
const path = require("path");
const fs = require("fs");
const { promisify } = require("util");

const mkdirAsync = promisify(fs.mkdir);
const existsAsync = promisify(fs.exists);

// Log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Log colors
const colors = {
  error: "red",
  warn: "yellow",
  info: "green",
  http: "magenta",
  debug: "blue",
};

// Add colors to winston
winston.addColors(colors);

// Log format for console
const consoleFormat = printf(({ level, message, timestamp, stack }) => {
  const formattedMessage = stack || message;
  return `${timestamp} [${level}]: ${formattedMessage}`;
});

// Create logs directory if it doesn't exist
const ensureLogsDir = async () => {
  const logsDir = path.join(process.cwd(), "logs");

  try {
    const exists = await existsAsync(logsDir);
    if (!exists) {
      await mkdirAsync(logsDir, { recursive: true });
    }
    return logsDir;
  } catch (error) {
    console.error("Error creating logs directory:", error);
    throw new Error("Failed to initialize logs directory");
  }
};

// Initialize logger
let logger;

const initializeLogger = async () => {
  const logsDir = await ensureLogsDir();

  const logFormat = combine(
    timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    format.errors({ stack: true }),
    json(),
  );

  const errorFilter = format((info) => (info.level === "error" ? info : false));
  const httpFilter = format((info) => (info.level === "http" ? info : false));

  logger = createLogger({
    levels,
    level: process.env.NODE_ENV === "development" ? "debug" : "info",
    format: logFormat,
    defaultMeta: { service: "chat-app" },
    transports: [
      // Error logs
      new transports.File({
        filename: path.join(logsDir, "error.log"),
        level: "error",
        format: combine(errorFilter(), logFormat),
        maxsize: 10485760, // 10MB
        maxFiles: 7, // Keep logs for 7 days
      }),
      // HTTP logs
      new transports.File({
        filename: path.join(logsDir, "http.log"),
        level: "http",
        format: combine(httpFilter(), logFormat),
        maxsize: 10485760, // 10MB
        maxFiles: 7,
      }),
      // All logs
      new transports.File({
        filename: path.join(logsDir, "combined.log"),
        maxsize: 10485760, // 10MB
        maxFiles: 7,
      }),
    ],
    exceptionHandlers: [
      new transports.File({
        filename: path.join(logsDir, "exceptions.log"),
        maxsize: 10485760, // 10MB
      }),
    ],
    exitOnError: false, // Don't exit on handled exceptions
  });

  // Add console transport in development
  if (process.env.NODE_ENV === "development") {
    logger.add(
      new transports.Console({
        format: combine(
          colorize({ all: true }),
          timestamp({ format: "HH:mm:ss" }),
          consoleFormat,
        ),
      }),
    );
  }

  // Handle unhandled promise rejections
  process.on("unhandledRejection", (reason) => {
    logger.error("Unhandled Rejection:", reason);
  });

  return logger;
};

// Get logger instance
const getLogger = () => {
  if (!logger) {
    throw new Error("Logger not initialized. Call initializeLogger() first.");
  }
  return logger;
};

// Stream for morgan HTTP request logging
const stream = {
  write: (message) => {
    const logger = getLogger();
    logger.http(message.trim());
  },
};

module.exports = {
  initializeLogger,
  getLogger,
  stream,
};
