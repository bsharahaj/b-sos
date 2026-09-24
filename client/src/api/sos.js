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

// reason is optional. Resolves to { sos } with status CANCELLED.
export async function cancelSos(id, reason) {
  try {
    const { data } = await http.post(`/sos/${id}/cancel`, reason ? { reason } : {});
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
