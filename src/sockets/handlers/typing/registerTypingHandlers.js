const { connections } = require("../../store");

function registerTypingHandlers(io, socket) {
  socket.on("typing:start", ({ to }) => {
    if (!to) return;
    const recipientSocketId = connections.get(to.toString());
    if (recipientSocketId && io.sockets.sockets.has(recipientSocketId)) {
      io.to(recipientSocketId).emit("typing:start", {
        from: socket.userId,
      });
    }
  });

  socket.on("typing:stop", ({ to }) => {
    if (!to) return;
    const recipientSocketId = connections.get(to.toString());
    if (recipientSocketId && io.sockets.sockets.has(recipientSocketId)) {
      io.to(recipientSocketId).emit("typing:stop", {
        from: socket.userId,
      });
    }
  });
}

module.exports = { registerTypingHandlers };
