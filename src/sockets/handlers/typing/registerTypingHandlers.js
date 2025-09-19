const { connections } = require("../../store");
const { isValidObjectId } = require("../direct/helpers");

function registerTypingHandlers(io, socket) {
  socket.on("typing:start", ({ to }) => {
    if (!to || !isValidObjectId(to)) return;
    const recipientSocketIds = connections.get(to.toString());
    if (recipientSocketIds) {
      recipientSocketIds.forEach((socketId) => {
        if (io.sockets.sockets.has(socketId)) {
          io.to(socketId).emit("typing:start", {
            from: socket.userId,
          });
        }
      });
    }
  });

  socket.on("typing:stop", ({ to }) => {
    if (!to || !isValidObjectId(to)) return;
    const recipientSocketIds = connections.get(to.toString());
    if (recipientSocketIds) {
      recipientSocketIds.forEach((socketId) => {
        if (io.sockets.sockets.has(socketId)) {
          io.to(socketId).emit("typing:stop", {
            from: socket.userId,
          });
        }
      });
    }
  });
}

module.exports = { registerTypingHandlers };
