const { registerUserProfileHandlers } = require("./userProfileHandlers");

function registerUserHandlers(io, socket) {
  registerUserProfileHandlers(io, socket);
}

module.exports = { registerUserHandlers };
