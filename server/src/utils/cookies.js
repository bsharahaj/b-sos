// Minimal Cookie header reader — avoids a cookie-parser dependency for the single cookie we use.
export function readCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return undefined;

  for (const pair of header.split(';')) {
    const index = pair.indexOf('=');
    if (index === -1) continue;
    if (pair.slice(0, index).trim() === name) return decodeURIComponent(pair.slice(index + 1).trim());
  }
  return undefined;
}
