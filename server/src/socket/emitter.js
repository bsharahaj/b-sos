// Lets services emit socket events without importing the Socket.io server (avoids a services <-> socket cycle).
// createSocketServer() registers the instance; until then (tests without sockets) emits are no-ops.
// Rule from CLAUDE.md §7: never io.emit to everyone — always to a room.
let io = null;

export function setIo(instance) {
  io = instance;
}

export function emitToUser(userId, event, payload) {
  io?.to(`user:${userId}`).emit(event, payload);
}

export function emitToSos(sosId, event, payload) {
  io?.to(`sos:${sosId}`).emit(event, payload);
}

// Puts every connected socket of a user into an SOS room (e.g. the helper who just accepted), so
// status and location events for that SOS reach them from now on.
export function joinUserToSos(userId, sosId) {
  io?.in(`user:${userId}`).socketsJoin(`sos:${sosId}`);
}
