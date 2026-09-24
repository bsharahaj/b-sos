import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import http from 'node:http';
import jwt from 'jsonwebtoken';
import { io as connect } from 'socket.io-client';
import { createApp } from '../../src/app.js';
import { createSocketServer, userRoom } from '../../src/socket/index.js';
import { positions } from '../../src/services/positions.js';
import { env } from '../../src/config/env.js';
import { prisma, resetDb } from '../helpers/db.js';
import { createUser } from '../helpers/auth.js';

let httpServer;
let io;
let url;
const clients = [];

beforeAll(async () => {
  httpServer = http.createServer(createApp());
  io = createSocketServer(httpServer);
  await new Promise((resolve) => httpServer.listen(0, resolve));
  url = `http://localhost:${httpServer.address().port}`;
});

afterAll(async () => {
  io.close();
  await new Promise((resolve) => httpServer.close(resolve));
  await prisma.$disconnect();
});

beforeEach(async () => {
  await resetDb();
  positions.clear();
});

afterEach(() => {
  for (const c of clients.splice(0)) c.disconnect();
});

function openSocket(token) {
  const socket = connect(url, { auth: token === undefined ? {} : { token }, transports: ['websocket'], reconnection: false });
  clients.push(socket);
  return new Promise((resolve) => {
    socket.on('connect', () => resolve({ socket, error: null }));
    socket.on('connect_error', (error) => resolve({ socket, error }));
  });
}

const emitLocation = (socket, payload) => new Promise((resolve) => socket.emit('helper:location', payload, resolve));

describe('socket handshake', () => {
  it('refuses a connection without a token', async () => {
    const { error } = await openSocket();
    expect(error.message).toBe('AUTH_REQUIRED');
  });

  it('refuses a bad token and an expired token with distinct codes', async () => {
    expect((await openSocket('not-a-jwt')).error.message).toBe('INVALID_TOKEN');

    const { user } = await createUser();
    const expired = jwt.sign({ sub: user.id, role: user.role }, env.JWT_ACCESS_SECRET, { expiresIn: -10 });
    expect((await openSocket(expired)).error.message).toBe('TOKEN_EXPIRED');
  });

  it('accepts a valid token and joins the user room', async () => {
    const { user, token } = await createUser();
    const { error } = await openSocket(token);

    expect(error).toBeNull();
    expect(io.sockets.adapter.rooms.get(userRoom(user.id))?.size).toBe(1);
  });
});

describe('helper:location', () => {
  const sample = { lat: 32.08534, lng: 34.78176, accuracy: 12 };

  it('stores the live position and persists it for an available helper', async () => {
    const { user, token } = await createUser();
    await prisma.helperProfile.create({ data: { userId: user.id, skills: ['GENERAL'], isAvailable: true } });
    const { socket } = await openSocket(token);

    const ack = await emitLocation(socket, sample);

    expect(ack).toEqual({ ok: true });
    expect(positions.get(user.id)).toMatchObject({ lat: sample.lat, lng: sample.lng, accuracy: 12 });
    const profile = await prisma.helperProfile.findUnique({ where: { userId: user.id } });
    expect(profile).toMatchObject({ lat: sample.lat, lng: sample.lng });
    expect(profile.lastSeenAt).toBeTruthy();
  });

  it('keeps the live position but does not persist for an unavailable helper', async () => {
    const { user, token } = await createUser();
    await prisma.helperProfile.create({ data: { userId: user.id, skills: ['GENERAL'], isAvailable: false } });
    const { socket } = await openSocket(token);

    await emitLocation(socket, sample);

    expect(positions.get(user.id)).not.toBeNull();
    const profile = await prisma.helperProfile.findUnique({ where: { userId: user.id } });
    expect(profile.lat).toBeNull();
    expect(profile.lastSeenAt).toBeNull();
  });

  it('rejects malformed samples without storing them', async () => {
    const { user, token } = await createUser();
    const { socket } = await openSocket(token);

    expect(await emitLocation(socket, { lat: 200, lng: 0 })).toEqual({ ok: false, code: 'INVALID_LOCATION' });
    expect(await emitLocation(socket, 'nonsense')).toEqual({ ok: false, code: 'INVALID_LOCATION' });
    expect(positions.get(user.id)).toBeNull();
  });

  it('forgets the position when the user\'s last socket disconnects', async () => {
    const { user, token } = await createUser();
    const { socket } = await openSocket(token);
    await emitLocation(socket, sample);

    socket.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(positions.get(user.id)).toBeNull();
  });
});

describe('sos:helper-location forwarding', () => {
  it("forwards an assigned helper's pings to the SOS room and nowhere else", async () => {
    const requester = await createUser({ phone: '+972501000001', phoneVerified: true });
    const helper = await createUser({ phone: '+972501000002' });
    const bystander = await createUser({ phone: '+972501000003' });
    const sos = await prisma.sosRequest.create({
      data: { requesterId: requester.user.id, helperId: helper.user.id, type: 'VEHICLE', lat: 32.08, lng: 34.78, accuracyM: 10, status: 'ACCEPTED' },
    });

    const { socket: requesterSocket } = await openSocket(requester.token); // joins the sos room on connect (ACCEPTED SOS)
    const { socket: bystanderSocket } = await openSocket(bystander.token);
    const { socket: helperSocket } = await openSocket(helper.token);
    await new Promise((resolve) => setTimeout(resolve, 100)); // room joins are async after connect

    const received = [];
    requesterSocket.on('sos:helper-location', (e) => received.push(e));
    const leaked = [];
    bystanderSocket.on('sos:helper-location', (e) => leaked.push(e));

    await emitLocation(helperSocket, { lat: 32.081, lng: 34.781, accuracy: 9 });
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ sosId: sos.id, lat: 32.081, lng: 34.781 });
    expect(leaked).toEqual([]);
  });

  it('does not forward when the helper has no active SOS', async () => {
    const requester = await createUser({ phone: '+972501000004', phoneVerified: true });
    const helper = await createUser({ phone: '+972501000005' });
    await prisma.sosRequest.create({
      data: { requesterId: requester.user.id, helperId: helper.user.id, type: 'VEHICLE', lat: 32.08, lng: 34.78, accuracyM: 10, status: 'RESOLVED' },
    });
    const { socket: requesterSocket } = await openSocket(requester.token);
    const { socket: helperSocket } = await openSocket(helper.token);
    const received = [];
    requesterSocket.on('sos:helper-location', (e) => received.push(e));

    await emitLocation(helperSocket, { lat: 32.081, lng: 34.781 });
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(received).toEqual([]);
  });
});
