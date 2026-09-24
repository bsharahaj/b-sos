import { http, toApiError } from './http.js';

// input: { type, lat, lng, accuracyM, description? }. Resolves to { sos }.
export async function createSos(input) {
  try {
    const { data } = await http.post('/sos', input);
    return data;
  } catch (err) {
    throw toApiError(err);
  }
}

// Resolves to { sos (exact location), etaMin }. Throws SOS_TAKEN when another helper won.
export async function acceptSos(id) {
  try {
    const { data } = await http.post(`/sos/${id}/accept`);
    return data;
  } catch (err) {
    throw toApiError(err);
  }
}

export async function declineSos(id) {
  try {
    const { data } = await http.post(`/sos/${id}/decline`);
    return data;
  } catch (err) {
    throw toApiError(err);
  }
}

// reason is optional. Resolves to { sos } with status CANCELLED.
export async function cancelSos(id, reason) {
  try {
    const { data } = await http.post(`/sos/${id}/cancel`, reason ? { reason } : {});
    return data;
  } catch (err) {
    throw toApiError(err);
  }
}

// Open SOS this user was alerted about as a helper. Resolves to { alerts: [{ sentAt, distanceM, sos }] }.
export async function getAlerts() {
  try {
    const { data } = await http.get('/sos/alerts');
    return data;
  } catch (err) {
    throw toApiError(err);
  }
}

// Resolves to { sos }.
export async function getSos(id) {
  try {
    const { data } = await http.get(`/sos/${id}`);
    return data;
  } catch (err) {
    throw toApiError(err);
  }
}
