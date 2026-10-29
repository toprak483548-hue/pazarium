function slugify(value) {
  return String(value || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i').replace(/ğ/g, 'g').replace(/ü/g, 'u')
    .replace(/ş/g, 's').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 130)
    .replace(/-+$/g, '');
}

function formatPrice(price) {
  if (price === null || price === undefined || price === '') return 'Fiyat belirtilmemiş';
  const number = Number(price);
  if (!Number.isFinite(number)) return 'Fiyat belirtilmemiş';
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency', currency: 'TRY', maximumFractionDigits: 0
  }).format(number);
}

function safeInternalPath(candidate, fallback = '/') {
  if (typeof candidate !== 'string' || !candidate.startsWith('/') || candidate.startsWith('//') || candidate.includes('\\')) {
    return fallback;
  }
  return candidate;
}

function absoluteUrl(baseUrl, path) {
  return `${String(baseUrl).replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
}

module.exports = { slugify, formatPrice, safeInternalPath, absoluteUrl };
