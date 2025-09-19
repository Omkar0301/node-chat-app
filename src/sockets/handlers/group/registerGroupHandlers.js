// socket/handlers/group/registerGroupHandlers.js
const {
  registerGroupMembershipHandlers,
} = require("./groupMembershipHandlers");
const {
  registerGroupManagementHandlers,
} = require("./groupManagementHandlers");
const { registerMessageHandlers } = require("./messageHandlers");

function registerGroupHandlers(io, socket) {
  registerGroupMembershipHandlers(io, socket);
  registerGroupManagementHandlers(io, socket);
  registerMessageHandlers(io, socket);
}

module.exports = { registerGroupHandlers };
