import { http, toApiError } from './http.js';

// Resolves to { user, helperProfile }. helperProfile is null until the user first saves helper settings.
export async function getMe() {
  try {
    const { data } = await http.get('/me');
    return data;
  } catch (err) {
    throw toApiError(err);
  }
}

// changes: any of { name, photoUrl, trustedContactPhone }. Resolves to { user }.
export async function updateMe(changes) {
  try {
    const { data } = await http.patch('/me', changes);
    return data;
  } catch (err) {
    throw toApiError(err);
  }
}

// changes: any of { skills, isAvailable }. Resolves to { helperProfile }.
export async function updateHelperProfile(changes) {
  try {
    const { data } = await http.patch('/me/helper', changes);
    return data;
  } catch (err) {
    throw toApiError(err);
  }
}
