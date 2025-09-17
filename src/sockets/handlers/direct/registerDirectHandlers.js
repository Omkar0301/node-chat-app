const { registerMessageHandlers } = require("./messageHandlers");

function registerDirectHandlers(io, socket) {
  registerMessageHandlers(io, socket);
}

module.exports = { registerDirectHandlers };
