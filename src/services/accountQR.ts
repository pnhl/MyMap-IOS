export function accountCodeFromQR(value: string) {
  const raw = value.trim();
  const prefixed = raw.match(/^mymap:friend:(.+)$/i)
    ?? raw.match(/^mymap:\/\/(?:friend|add)\/(.+)$/i);
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) && !prefixed) {
    throw new Error('Đây không phải mã kết bạn MyMap.');
  }
  const code = (prefixed?.[1] ?? raw).trim().toUpperCase();
  if (!/^[A-Z0-9_-]{4,80}$/.test(code)) throw new Error('Đây không phải mã kết bạn MyMap.');
  return code;
}
