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

// Resolves to { sos }.
export async function getSos(id) {
  try {
    const { data } = await http.get(`/sos/${id}`);
    return data;
  } catch (err) {
    throw toApiError(err);
  }
}
