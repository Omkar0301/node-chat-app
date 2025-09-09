const activeConnections = new Map();

const connections = {
  set(userId, socketId) {
    activeConnections.set(userId, socketId);
  },
  get(userId) {
    return activeConnections.get(userId);
  },
  delete(userId) {
    return activeConnections.delete(userId);
  },
  has(userId) {
    return activeConnections.has(userId);
  },
  // expose raw map if needed for iteration
  map: activeConnections,
};

module.exports = { connections };
