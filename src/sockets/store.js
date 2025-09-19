const activeConnections = new Map();

const connections = {
  set(userId, socketId) {
    if (!activeConnections.has(userId)) {
      activeConnections.set(userId, new Set());
    }
    activeConnections.get(userId).add(socketId);
  },
  get(userId) {
    return activeConnections.get(userId) || new Set();
  },
  delete(userId) {
    return activeConnections.delete(userId);
  },
  deleteSocket(userId, socketId) {
    const userSockets = activeConnections.get(userId);
    if (userSockets) {
      userSockets.delete(socketId);
      if (userSockets.size === 0) {
        activeConnections.delete(userId);
      }
    }
  },
  has(userId) {
    return activeConnections.has(userId);
  },
  // expose raw map if needed for iteration
  map: activeConnections,
};

module.exports = { connections };
