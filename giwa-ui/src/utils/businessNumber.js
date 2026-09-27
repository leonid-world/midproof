export function normalizeBusinessNumber(value) {
  return String(value ?? '')
    .replace(/\D/g, '')
    .slice(0, 10)
}

export function formatBusinessNumber(value) {
  const digits = normalizeBusinessNumber(value)
  const parts = [digits.slice(0, 3), digits.slice(3, 5), digits.slice(5, 10)]
  return parts.filter(Boolean).join('-')
}
