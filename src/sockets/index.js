const { socketAuth } = require("../middleware/auth");
const { connections } = require("./store");
const {
  registerDirectHandlers,
} = require("./handlers/direct/registerDirectHandlers");
const {
  registerTypingHandlers,
} = require("./handlers/typing/registerTypingHandlers");
const {
  registerGroupHandlers,
} = require("./handlers/group/registerGroupHandlers");
const { registerUserHandlers } = require("./handlers/user");
const { setupOnConnect } = require("./handlers/lifecycle/onConnect");
const { registerDisconnect } = require("./handlers/lifecycle/onDisconnect");

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
      const previouslyConnected = connections.has(userIdStr);
      connections.set(userIdStr, socket.id);
      socket.userId = userIdStr;

      // Join personal room
      socket.join(`user_${userIdStr}`);

      // Connection setup (status updates, pending deliveries)
      await setupOnConnect(io, socket, previouslyConnected);

      // Register modular handlers
      registerDirectHandlers(io, socket);
      registerTypingHandlers(io, socket);
      registerGroupHandlers(io, socket);
      registerUserHandlers(io, socket);
      registerDisconnect(io, socket);
    } catch (err) {
      console.error("Socket connection setup error", err);
    }
  });

  return io;
};

module.exports = { initializeSocket };
