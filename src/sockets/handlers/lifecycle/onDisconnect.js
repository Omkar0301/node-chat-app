const User = require("../../../models/User");
const { connections } = require("../../store");

function registerDisconnect(io, socket) {
  socket.on("disconnect", async () => {
    console.log("User disconnected:", socket.userId);
    try {
      connections.deleteSocket(socket.userId, socket.id);
      if (!connections.has(socket.userId)) {
        const now = new Date();
        await User.findByIdAndUpdate(socket.user._id, {
          online: false,
          lastSeen: now,
        });
        socket.broadcast.emit("user:status", {
          userId: socket.user._id,
          online: false,
          firstName: socket.user.firstName,
          lastName: socket.user.lastName,
          lastSeen: now.toISOString(),
        });
      }
    } catch (error) {
      console.error("Error updating user status on disconnect:", error);
    }
  });
}

module.exports = { registerDisconnect };
