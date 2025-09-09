const { socketAuth } = require("../middleware/auth");
const { connections } = require("./store");
const { registerDirectHandlers } = require("./handlers/direct");
const { registerTypingHandlers } = require("./handlers/typing");
const { registerGroupHandlers } = require("./handlers/group");
const { setupOnConnect, registerDisconnect } = require("./handlers/lifecycle");

const initializeSocket = (server) => {
  const io = require("socket.io")(server, {
    cors: {
      origin: process.env.CLIENT_URL || "*",
      methods: ["GET", "POST"],
      credentials: true,
    },
    pingTimeout: 10000,
    pingInterval: 25000,
  });

  // Socket.IO middleware
  io.use(socketAuth);

  io.on("connection", async (socket) => {
    try {
      const userIdStr = socket.user._id.toString();
      console.log("User connected:", userIdStr);

      // Add user to active connections
      connections.set(userIdStr, socket.id);
      socket.userId = userIdStr;

      // Connection setup (status updates, pending deliveries)
      await setupOnConnect(io, socket);

      // Join personal room
      socket.join(`user_${userIdStr}`);

      // Register modular handlers
      registerDirectHandlers(io, socket);
      registerTypingHandlers(io, socket);
      registerGroupHandlers(io, socket);
      registerDisconnect(io, socket);
    } catch (err) {
      console.error("Socket connection setup error", err);
    }
  });

  return io;
};

module.exports = { initializeSocket };
