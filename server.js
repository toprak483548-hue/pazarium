require('dotenv').config();

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const bcrypt = require('bcryptjs');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const { pool, initializeDatabase } = require('./db');
const { categories, cities, conditions, categoryBySlug, categoryName, conditionName } = require('./lib/categories');
const { slugify, formatPrice, safeInternalPath, absoluteUrl } = require('./lib/helpers');

const app = express();
const isProduction = process.env.NODE_ENV === 'production';
const PORT = Number(process.env.PORT) || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET;

if (!SESSION_SECRET || SESSION_SECRET.length < 32) {
  throw new Error('SESSION_SECRET en az 32 karakter olmalı. Render bunu otomatik üretebilir; yerelde .env içine rastgele bir değer koy.');
}

if (isProduction) app.set('trust proxy', 1);
app.disable('x-powered-by');
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      fontSrc: ["'self'", 'data:'],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      objectSrc: ["'none'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      upgradeInsecureRequests: isProduction ? [] : null
    }
  },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
}));
app.use(express.urlencoded({ extended: false, limit: '25kb' }));
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: isProduction ? '1d' : 0,
  etag: true,
  fallthrough: true
}));

app.use(session({
  store: new PgSession({ pool, tableName: 'user_sessions', createTableIfMissing: true }),
  name: 'vitrinova.sid',
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000
  }
}));

function baseUrlFor(req) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
  if (process.env.RENDER_EXTERNAL_HOSTNAME) return `https://${process.env.RENDER_EXTERNAL_HOSTNAME}`;
  return `${req.protocol}://${req.get('host')}`;
}

app.use((req, res, next) => {
  if (!req.session.csrfToken) req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  res.locals.csrfToken = req.session.csrfToken;
  res.locals.currentUser = req.session.user || null;
  res.locals.categories = categories;
  res.locals.cities = cities;
  res.locals.conditions = conditions;
  res.locals.currentPath = req.path;
  res.locals.baseUrl = baseUrlFor(req);
  res.locals.pageTitle = 'Vitrinova — İyi bir şey bulmanın yeni yolu';
  res.locals.pageDescription = 'İhtiyacını bul, kullanmadığını değerlendir. Vitrinova’da farklı kategorilerde ilanları keşfet.';
  res.locals.canonicalUrl = absoluteUrl(res.locals.baseUrl, req.path);
  res.locals.flash = req.session.flash || null;
  delete req.session.flash;
  res.locals.formatPrice = formatPrice;
  res.locals.categoryName = categoryName;
  res.locals.conditionName = conditionName;
  next();
});

function setFlash(req, type, message) {
  req.session.flash = { type, message };
}

function requireAuth(req, res, next) {
  if (!req.session.user) {
    setFlash(req, 'info', 'Bu işlem için önce giriş yapmalısın.');
    const refererPath = req.get('referer') ? req.get('referer').replace(baseUrlFor(req), '') : '';
    req.session.returnTo = req.method === 'POST'
      ? safeInternalPath(req.body.returnTo || refererPath, '/hesabim')
      : safeInternalPath(req.originalUrl, '/hesabim');
    return res.redirect('/giris');
  }
  next();
}

function verifyCsrf(req, res, next) {
  const received = typeof req.body._csrf === 'string' ? req.body._csrf : '';
  const expected = typeof req.session.csrfToken === 'string' ? req.session.csrfToken : '';
  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);
  if (!received || !expected || receivedBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(receivedBuffer, expectedBuffer)) {
    return res.status(403).render('error', {
      statusCode: 403,
      heading: 'Form süresi dolmuş olabilir',
      message: 'Güvenlik kontrolü tamamlanamadı. Sayfayı yenileyip tekrar dene.'
    });
  }
  next();
}

app.use((req, res, next) => {
  if (req.method === 'POST') return verifyCsrf(req, res, next);
  next();
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: 'Çok fazla deneme yapıldı. Lütfen 15 dakika sonra tekrar dene.'
});

const listingLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 12,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: 'Bir saat içinde çok fazla ilan denemesi yapıldı. Daha sonra tekrar dene.'
});

async function getActiveAds({ q, category, city, minPrice, maxPrice, sort = 'newest', limit = 48 } = {}) {
  const conditionsSql = ["a.status = 'active'"];
  const values = [];
  const addValue = (value) => { values.push(value); return `$${values.length}`; };

  if (q) {
    const placeholder = addValue(`%${q.slice(0, 100)}%`);
    conditionsSql.push(`(a.title ILIKE ${placeholder} OR a.description ILIKE ${placeholder} OR a.city ILIKE ${placeholder})`);
  }
  if (category && categoryBySlug(category)) conditionsSql.push(`a.category = ${addValue(category)}`);
  if (city && cities.includes(city)) conditionsSql.push(`a.city = ${addValue(city)}`);
  if (minPrice !== undefined && minPrice !== '' && Number.isFinite(Number(minPrice)) && Number(minPrice) >= 0) {
    conditionsSql.push(`a.price >= ${addValue(Number(minPrice))}`);
  }
  if (maxPrice !== undefined && maxPrice !== '' && Number.isFinite(Number(maxPrice)) && Number(maxPrice) >= 0) {
    conditionsSql.push(`a.price <= ${addValue(Number(maxPrice))}`);
  }

  const sortSql = {
    newest: 'a.created_at DESC',
    price_asc: 'a.price ASC NULLS LAST, a.created_at DESC',
    price_desc: 'a.price DESC NULLS LAST, a.created_at DESC'
  }[sort] || 'a.created_at DESC';
  const limitPlaceholder = addValue(Math.min(Math.max(Number(limit) || 48, 1), 100));
  const sql = `
    SELECT a.*, u.name AS owner_name
    FROM ads a
    LEFT JOIN users u ON u.id = a.owner_id
    WHERE ${conditionsSql.join(' AND ')}
    ORDER BY ${sortSql}
    LIMIT ${limitPlaceholder}
  `;
  const result = await pool.query(sql, values);
  return result.rows;
}

async function getCountsByCategory() {
  const result = await pool.query("SELECT category, COUNT(*)::int AS count FROM ads WHERE status = 'active' GROUP BY category");
  return Object.fromEntries(result.rows.map((row) => [row.category, row.count]));
}

function renderListingPage(res, { ads, heading, intro, query = {}, activeCategory = null, title }) {
  res.locals.pageTitle = title || `${heading} | Vitrinova`;
  res.locals.pageDescription = intro || 'Vitrinova’da ilanları keşfet, ihtiyacına uygun seçeneği bul.';
  res.locals.canonicalUrl = absoluteUrl(res.locals.baseUrl, activeCategory ? `/kategori/${activeCategory.slug}` : '/ilanlar');
  return res.render('listings', { ads, heading, intro, query, activeCategory });
}

app.get('/', async (req, res, next) => {
  try {
    const [ads, counts] = await Promise.all([
      getActiveAds({ limit: 8 }),
      getCountsByCategory()
    ]);
    res.locals.canonicalUrl = absoluteUrl(res.locals.baseUrl, '/');
    res.render('home', { ads, counts });
  } catch (error) { next(error); }
});

app.get('/ilanlar', async (req, res, next) => {
  try {
    const query = {
      q: String(req.query.q || '').trim().slice(0, 100),
      category: String(req.query.category || ''),
      city: String(req.query.city || ''),
      minPrice: String(req.query.minPrice || ''),
      maxPrice: String(req.query.maxPrice || ''),
      sort: String(req.query.sort || 'newest')
    };
    const ads = await getActiveAds(query);
    const pieces = [];
    if (query.q) pieces.push(`“${query.q}” için`);
    if (categoryBySlug(query.category)) pieces.push(categoryName(query.category));
    if (cities.includes(query.city)) pieces.push(query.city);
    const heading = pieces.length ? `${pieces.join(' · ')} ilanları` : 'Tüm ilanlar';
    return renderListingPage(res, {
      ads, heading, intro: 'Sonuçları ihtiyacına göre filtrele, karşılaştır ve sana uygun ilanı bul.', query,
      title: `${heading} | Vitrinova`
    });
  } catch (error) { next(error); }
});

app.get('/kategori/:categorySlug', async (req, res, next) => {
  try {
    const category = categoryBySlug(req.params.categorySlug);
    if (!category) return res.status(404).render('error', { statusCode: 404, heading: 'Kategori bulunamadı', message: 'Bu kategori mevcut değil veya adres değişmiş olabilir.' });
    const ads = await getActiveAds({ category: category.slug, limit: 48 });
    return renderListingPage(res, {
      ads, heading: `${category.name} ilanları`, intro: category.description, activeCategory: category,
      query: { category: category.slug, q: '', city: '', minPrice: '', maxPrice: '', sort: 'newest' },
      title: `${category.name} İlanları | Vitrinova`
    });
  } catch (error) { next(error); }
});

app.get('/ilan/:id/:slug?', async (req, res, next) => {
  try {
    if (!/^\d+$/.test(req.params.id)) return res.status(404).render('error', { statusCode: 404, heading: 'İlan bulunamadı', message: 'Aradığın ilan mevcut değil veya kaldırılmış olabilir.' });
    const result = await pool.query(`
      SELECT a.*, u.name AS owner_name
      FROM ads a LEFT JOIN users u ON u.id = a.owner_id
      WHERE a.id = $1 AND a.status = 'active'
      LIMIT 1
    `, [req.params.id]);
    const ad = result.rows[0];
    if (!ad) return res.status(404).render('error', { statusCode: 404, heading: 'İlan bulunamadı', message: 'Aradığın ilan mevcut değil veya kaldırılmış olabilir.' });
    const expectedSlug = slugify(ad.title) || `ilan-${ad.id}`;
    if (req.params.slug !== expectedSlug) return res.redirect(301, `/ilan/${ad.id}/${expectedSlug}`);

    let isFavorite = false;
    if (req.session.user) {
      const fav = await pool.query('SELECT 1 FROM favorites WHERE user_id = $1 AND ad_id = $2', [req.session.user.id, ad.id]);
      isFavorite = fav.rowCount > 0;
    }
    const relatedAds = await getActiveAds({ category: ad.category, limit: 4 });
    const filteredRelated = relatedAds.filter((item) => String(item.id) !== String(ad.id)).slice(0, 3);

    res.locals.pageTitle = `${ad.title} — ${formatPrice(ad.price)} | Vitrinova`;
    res.locals.pageDescription = String(ad.description).replace(/\s+/g, ' ').slice(0, 155);
    res.locals.canonicalUrl = absoluteUrl(res.locals.baseUrl, `/ilan/${ad.id}/${expectedSlug}`);
    res.render('listing-detail', { ad, isFavorite, relatedAds: filteredRelated });
  } catch (error) { next(error); }
});

app.get('/kayit', (req, res) => {
  if (req.session.user) return res.redirect('/hesabim');
  res.locals.pageTitle = 'Hesap oluştur | Vitrinova';
  res.render('register', { form: {} });
});

app.post('/kayit', authLimiter, async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim().replace(/\s+/g, ' ');
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const confirmPassword = String(req.body.confirmPassword || '');
    const form = { name, email };
    let errorMessage = null;
    if (name.length < 2 || name.length > 80) errorMessage = 'Ad soyad 2–80 karakter arasında olmalı.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) errorMessage = 'Geçerli bir e-posta adresi gir.';
    else if (password.length < 10 || password.length > 128) errorMessage = 'Şifren en az 10 karakter olmalı.';
    else if (password !== confirmPassword) errorMessage = 'Şifreler eşleşmiyor.';

    if (errorMessage) {
      res.status(400);
      res.locals.pageTitle = 'Hesap oluştur | Vitrinova';
      return res.render('register', { form, errorMessage });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email, role',
      [name, email, passwordHash]
    );
    await new Promise((resolve, reject) => req.session.regenerate((err) => err ? reject(err) : resolve()));
    req.session.user = result.rows[0];
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
    setFlash(req, 'success', 'Hesabın oluşturuldu. Şimdi ilk ilanını keşfedebilir veya ekleyebilirsin.');
    return req.session.save((err) => err ? next(err) : res.redirect('/hesabim'));
  } catch (error) {
    if (error.code === '23505') {
      res.status(409);
      res.locals.pageTitle = 'Hesap oluştur | Vitrinova';
      return res.render('register', { form: { name: req.body.name, email: req.body.email }, errorMessage: 'Bu e-posta adresiyle bir hesap zaten var.' });
    }
    next(error);
  }
});

app.get('/giris', (req, res) => {
  if (req.session.user) return res.redirect('/hesabim');
  res.locals.pageTitle = 'Giriş yap | Vitrinova';
  res.render('login', { form: {} });
});

app.post('/giris', authLimiter, async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const result = await pool.query('SELECT id, name, email, role, password_hash FROM users WHERE email = $1 LIMIT 1', [email]);
    const user = result.rows[0];
    const valid = user ? await bcrypt.compare(password, user.password_hash) : false;
    if (!valid) {
      res.status(400);
      res.locals.pageTitle = 'Giriş yap | Vitrinova';
      return res.render('login', { form: { email }, errorMessage: 'E-posta veya şifre doğru değil.' });
    }
    const target = safeInternalPath(req.session.returnTo, '/hesabim');
    await new Promise((resolve, reject) => req.session.regenerate((err) => err ? reject(err) : resolve()));
    req.session.user = { id: user.id, name: user.name, email: user.email, role: user.role };
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
    setFlash(req, 'success', `Tekrar hoş geldin, ${user.name}.`);
    return req.session.save((err) => err ? next(err) : res.redirect(target));
  } catch (error) { next(error); }
});

app.post('/cikis', requireAuth, (req, res, next) => {
  req.session.destroy((error) => {
    if (error) return next(error);
    res.clearCookie('vitrinova.sid', { httpOnly: true, secure: isProduction, sameSite: 'lax' });
    res.redirect('/');
  });
});

app.get('/ilan-ekle', requireAuth, (req, res) => {
  res.locals.pageTitle = 'Yeni ilan ekle | Vitrinova';
  res.locals.pageDescription = 'İlanını birkaç adımda hazırla.';
  res.render('new-listing', { form: {} });
});

app.post('/ilan-ekle', requireAuth, listingLimiter, async (req, res, next) => {
  try {
    const form = {
      title: String(req.body.title || '').trim(),
      description: String(req.body.description || '').trim(),
      price: String(req.body.price || '').trim(),
      category: String(req.body.category || ''),
      city: String(req.body.city || ''),
      condition: String(req.body.condition || 'used'),
      image_url: String(req.body.image_url || '').trim()
    };
    let errorMessage = null;
    if (form.title.length < 8 || form.title.length > 120) errorMessage = 'İlan başlığı 8–120 karakter arasında olmalı.';
    else if (form.description.length < 20 || form.description.length > 6000) errorMessage = 'Açıklama 20–6000 karakter arasında olmalı.';
    else if (!categoryBySlug(form.category)) errorMessage = 'Listeden geçerli bir kategori seç.';
    else if (!cities.includes(form.city)) errorMessage = 'Listeden geçerli bir şehir seç.';
    else if (!conditions.some((item) => item.value === form.condition)) errorMessage = 'Listeden geçerli bir ürün durumu seç.';
    else if (form.price && (!Number.isFinite(Number(form.price)) || Number(form.price) < 0 || Number(form.price) > 999999999999)) errorMessage = 'Geçerli, sıfırdan küçük olmayan bir fiyat gir.';
    else if (form.image_url && !isSafeImageUrl(form.image_url)) errorMessage = 'Görsel bağlantısı https:// ile başlayan geçerli bir adres olmalı.';

    if (errorMessage) {
      res.status(400);
      res.locals.pageTitle = 'Yeni ilan ekle | Vitrinova';
      return res.render('new-listing', { form, errorMessage });
    }

    const result = await pool.query(`
      INSERT INTO ads (owner_id, title, slug, description, price, category, city, condition, image_url, status, is_demo)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active', FALSE)
      RETURNING id, title, slug
    `, [req.session.user.id, form.title, slugify(form.title), form.description, form.price ? Number(form.price) : null, form.category, form.city, form.condition, form.image_url || null]);
    const ad = result.rows[0];
    setFlash(req, 'success', 'İlanın yayınlandı. İletişim bilgilerini paylaşırken dikkatli ol.');
    return res.redirect(`/ilan/${ad.id}/${ad.slug || `ilan-${ad.id}`}`);
  } catch (error) { next(error); }
});

function isSafeImageUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) return false;
    const hostname = url.hostname.toLowerCase();
    if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname === '127.0.0.1' || hostname === '::1') return false;
    return true;
  } catch { return false; }
}

app.get('/hesabim', requireAuth, async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT a.*, u.name AS owner_name
      FROM ads a LEFT JOIN users u ON u.id = a.owner_id
      WHERE a.owner_id = $1
      ORDER BY a.created_at DESC
      LIMIT 100
    `, [req.session.user.id]);
    res.locals.pageTitle = 'Hesabım | Vitrinova';
    res.render('dashboard', { ads: result.rows });
  } catch (error) { next(error); }
});

app.post('/hesabim/ilan/:id/sil', requireAuth, async (req, res, next) => {
  try {
    if (!/^\d+$/.test(req.params.id)) return res.redirect('/hesabim');
    const result = await pool.query('DELETE FROM ads WHERE id = $1 AND owner_id = $2 RETURNING id', [req.params.id, req.session.user.id]);
    setFlash(req, result.rowCount ? 'success' : 'info', result.rowCount ? 'İlanın kaldırıldı.' : 'Bu ilanı kaldırma yetkin yok.');
    res.redirect('/hesabim');
  } catch (error) { next(error); }
});

app.post('/ilan/:id/favori', requireAuth, async (req, res, next) => {
  try {
    const id = req.params.id;
    if (!/^\d+$/.test(id)) return res.redirect('/ilanlar');
    const exists = await pool.query('SELECT 1 FROM favorites WHERE user_id = $1 AND ad_id = $2', [req.session.user.id, id]);
    if (exists.rowCount) {
      await pool.query('DELETE FROM favorites WHERE user_id = $1 AND ad_id = $2', [req.session.user.id, id]);
      setFlash(req, 'success', 'İlan favorilerinden çıkarıldı.');
    } else {
      const activeAd = await pool.query("SELECT 1 FROM ads WHERE id = $1 AND status = 'active'", [id]);
      if (activeAd.rowCount) {
        await pool.query('INSERT INTO favorites (user_id, ad_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [req.session.user.id, id]);
        setFlash(req, 'success', 'İlan favorilerine eklendi.');
      }
    }
    const referer = safeInternalPath(req.body.returnTo, '/favoriler');
    res.redirect(referer);
  } catch (error) { next(error); }
});

app.get('/favoriler', requireAuth, async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT a.*, u.name AS owner_name
      FROM favorites f
      JOIN ads a ON a.id = f.ad_id
      LEFT JOIN users u ON u.id = a.owner_id
      WHERE f.user_id = $1 AND a.status = 'active'
      ORDER BY f.created_at DESC
      LIMIT 100
    `, [req.session.user.id]);
    res.locals.pageTitle = 'Favorilerim | Vitrinova';
    res.render('favorites', { ads: result.rows });
  } catch (error) { next(error); }
});

app.post('/ilan/:id/bildir', async (req, res, next) => {
  try {
    const adId = req.params.id;
    const reason = String(req.body.reason || 'other');
    const details = String(req.body.details || '').trim().slice(0, 1000);
    const allowedReasons = ['fraud', 'wrong-category', 'inappropriate', 'sold', 'other'];
    if (!/^\d+$/.test(adId) || !allowedReasons.includes(reason)) {
      setFlash(req, 'info', 'Bildirim alınamadı. Lütfen tekrar dene.');
      return res.redirect('/ilanlar');
    }
    const ad = await pool.query("SELECT id FROM ads WHERE id = $1 AND status = 'active'", [adId]);
    if (!ad.rowCount) return res.redirect('/ilanlar');
    await pool.query('INSERT INTO reports (ad_id, reporter_id, reason, details) VALUES ($1, $2, $3, $4)', [adId, req.session.user?.id || null, reason, details || null]);
    setFlash(req, 'success', 'Bildirimin alındı. Teşekkür ederiz.');
    res.redirect(safeInternalPath(req.get('referer')?.replace(baseUrlFor(req), ''), `/ilan/${adId}`));
  } catch (error) { next(error); }
});

app.get('/hakkimizda', (req, res) => {
  res.locals.pageTitle = 'Hakkımızda | Vitrinova';
  res.locals.pageDescription = 'Vitrinova’nın amacı ve yaklaşımı.';
  res.render('static-page', {
    heading: 'Alıp satmayı daha kolay hale getirmek için',
    updatedAt: '29 Ekim 2026',
    sections: [
      { title: 'Amacımız', body: 'Vitrinova, insanlara ihtiyaç duydukları ürünleri bulabilecekleri ve kullanmadıkları ürünleri değerlendirebilecekleri sade bir ilan deneyimi sunmak için geliştirilen bir platformdur.' },
      { title: 'Nasıl çalışıyoruz?', body: 'İlk sürümümüz temel ilan keşfi, filtreleme, hesap oluşturma ve ilan yayınlama akışlarına odaklanır. Güvenlik ve kullanıcı deneyimini adım adım geliştirmeyi hedefliyoruz.' },
      { title: 'Güvenli alışveriş', body: 'Vitrinova şu an ödeme, kargo, kimlik doğrulama veya emanet ödeme hizmeti sunmaz. Ürün ve satıcı hakkında bilgi almadan ödeme yapma; platform dışı bağlantılar ve olağan dışı ödeme taleplerine karşı dikkatli ol.' }
    ]
  });
});

app.get('/gizlilik', (req, res) => {
  res.locals.pageTitle = 'Gizlilik | Vitrinova';
  res.locals.pageDescription = 'Vitrinova gizlilik yaklaşımı hakkında bilgilendirme.';
  res.render('static-page', {
    heading: 'Gizlilik ve kişisel veriler',
    updatedAt: '29 Ekim 2026',
    sections: [
      { title: 'Bu sayfa hakkında', body: 'Bu metin başlangıç taslağıdır; yayına çıkmadan önce gerçek veri işleme süreçlerine, işletmeci bilgilerine ve yürürlükteki mevzuata göre gözden geçirilmelidir. Tek başına hukuki uyum garantisi değildir.' },
      { title: 'İşlenen bilgiler', body: 'Hesap açtığında adın ve e-posta adresin, yayınladığın ilanlar ve favorilerin platform işlevlerini sağlamak amacıyla saklanır. Oturum güvenliği için teknik çerez kullanılır. İlan açıklamasına kişisel veya hassas bilgilerini yazmamanı öneririz.' },
      { title: 'Haklar ve iletişim', body: 'Kişisel verilerinle ilgili erişim, düzeltme veya silme talepleri için site işletmecisinin iletişim bilgileri yayına çıkmadan önce bu alana eklenmelidir. Veri sorumlusu bilgileri, saklama süreleri, hukuki sebepler ve başvuru yöntemi netleştirilmeden bu sayfa tamamlanmış sayılmaz.' }
    ]
  });
});

app.get('/kullanim-kosullari', (req, res) => {
  res.locals.pageTitle = 'Kullanım koşulları | Vitrinova';
  res.locals.pageDescription = 'Vitrinova kullanım koşulları hakkında bilgilendirme.';
  res.render('static-page', {
    heading: 'Kullanım koşulları',
    updatedAt: '29 Ekim 2026',
    sections: [
      { title: 'Taslak bilgilendirmesi', body: 'Bu metin yayın öncesi ürün taslağıdır. Platform işletmecisi ve iş modeline uygun, hukuki danışmanlıkla gözden geçirilmiş koşulların yerine geçmez.' },
      { title: 'İlanların sorumluluğu', body: 'Kullanıcılar ilanlarında doğru, güncel ve hukuka uygun bilgi paylaşmalıdır. Başkasına ait görselleri, yanıltıcı fiyatları, yasa dışı ürünleri veya başkalarının haklarını ihlal eden içerikleri paylaşma.' },
      { title: 'Platformun kapsamı', body: 'Vitrinova ilanları buluşturan bir platform başlangıcıdır. Şu anda ödeme, teslimat, emanet ödeme veya alıcı/satıcı garantisi sunulmamaktadır. İşlem öncesinde tarafların bilgileri ve ürün durumu dikkatle doğrulanmalıdır.' }
    ]
  });
});

app.get('/robots.txt', (req, res) => {
  res.type('text/plain').send([
    'User-agent: *',
    'Allow: /',
    'Disallow: /hesabim',
    'Disallow: /ilan-ekle',
    'Disallow: /giris',
    'Disallow: /kayit',
    'Disallow: /favoriler',
    'Disallow: /cikis',
    `Sitemap: ${absoluteUrl(baseUrlFor(req), '/sitemap.xml')}`,
    ''
  ].join('\n'));
});

app.get('/sitemap.xml', async (req, res, next) => {
  try {
    const base = baseUrlFor(req);
    const result = await pool.query("SELECT id, slug, updated_at FROM ads WHERE status = 'active' AND is_demo = FALSE ORDER BY updated_at DESC LIMIT 20000");
    const staticPaths = ['/', '/ilanlar', '/hakkimizda', '/gizlilik', '/kullanim-kosullari', ...categories.map((c) => `/kategori/${c.slug}`)];
    const entries = staticPaths.map((url) => `<url><loc>${xmlEscape(absoluteUrl(base, url))}</loc></url>`);
    for (const ad of result.rows) {
      const slug = ad.slug || `ilan-${ad.id}`;
      entries.push(`<url><loc>${xmlEscape(absoluteUrl(base, `/ilan/${ad.id}/${slug}`))}</loc><lastmod>${new Date(ad.updated_at).toISOString()}</lastmod></url>`);
    }
    res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join('\n')}\n</urlset>`);
  } catch (error) { next(error); }
});

function xmlEscape(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.status(200).json({ ok: true, database: 'connected' });
  } catch {
    res.status(503).json({ ok: false, database: 'unavailable' });
  }
});

app.use((req, res) => {
  res.status(404).render('error', {
    statusCode: 404,
    heading: 'Aradığın sayfa burada değil',
    message: 'Bağlantı değişmiş olabilir. Arama yaparak aradığını yeniden bulabilirsin.'
  });
});

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  console.error(error.stack || error.message || error);
  if (error.type === 'entity.too.large') {
    return res.status(413).render('error', { statusCode: 413, heading: 'Form çok büyük', message: 'Lütfen daha kısa bir içerikle tekrar dene.' });
  }
  res.status(500).render('error', {
    statusCode: 500,
    heading: 'Bir şeyler yolunda gitmedi',
    message: isProduction ? 'Beklenmeyen bir hata oluştu. Biraz sonra tekrar deneyebilirsin.' : error.message
  });
});

async function seedDemoData() {
  if (process.env.SEED_DEMO_DATA !== 'true') return;
  const current = await pool.query('SELECT COUNT(*)::int AS count FROM ads');
  if (current.rows[0].count > 0) return;
  const demo = [
    {
      title: 'Şehir içi kullanıma uygun, bakımlı otomobil',
      description: 'Bu ilan örnek amaçlı eklenmiştir. Gerçek bir ürün veya satıcıyı temsil etmez. Canlı kullanımda ilan sahibi doğru bilgileri ve güncel fotoğrafları eklemelidir.',
      price: 485000, category: 'vasita', city: 'İzmir', condition: 'used',
      image_url: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=1000&q=80'
    },
    {
      title: 'Aydınlık ve ferah daire — örnek ilan',
      description: 'Bu örnek ilan, emlak kategorisinin arayüzünü göstermek için kullanılır. Fotoğraf temsili olabilir; ilan gerçek bir mülkü veya fiyatı temsil etmez.',
      price: 2750000, category: 'emlak', city: 'Ankara', condition: 'used',
      image_url: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1000&q=80'
    },
    {
      title: 'Günlük kullanıma uygun akıllı telefon',
      description: 'Bu ilan örnek amaçlı eklenmiştir. Gerçek bir ürün veya satıcıyı temsil etmez. Ürün özellikleri ve fiyatı demo içeriktir.',
      price: 12999, category: 'elektronik', city: 'İstanbul', condition: 'like-new',
      image_url: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=1000&q=80'
    },
    {
      title: 'Minimal tasarımlı rahat koltuk',
      description: 'Ev & Yaşam kategorisi için örnek bir ilan. Gerçek ürün satışını temsil etmez; canlı ortamda örnek veriler kullanıcıların gerçek ilanlarıyla değiştirilmelidir.',
      price: 8500, category: 'ev-yasam', city: 'Bursa', condition: 'used',
      image_url: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=1000&q=80'
    },
    {
      title: 'Günlük kullanım için spor ayakkabı',
      description: 'Moda kategorisi tasarımını göstermek için eklenmiş örnek içeriktir. Fotoğraf ve fiyat temsili olup gerçek bir satışı ifade etmez.',
      price: 1750, category: 'moda', city: 'Antalya', condition: 'new',
      image_url: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=1000&q=80'
    },
    {
      title: 'Hafta sonu sürüşleri için şehir bisikleti',
      description: 'Bu ilan arayüzü göstermek için hazırlanmış demo içeriktir. Gerçek ilanlar için ürün durumu, konum ve fiyat bilgilerini doğrula.',
      price: 6200, category: 'spor-hobi', city: 'Muğla', condition: 'used',
      image_url: 'https://images.unsplash.com/photo-1485965120184-e220f721d03e?auto=format&fit=crop&w=1000&q=80'
    }
  ];
  for (const ad of demo) {
    await pool.query(`
      INSERT INTO ads (owner_id, title, slug, description, price, category, city, condition, image_url, status, is_demo)
      VALUES (NULL, $1, $2, $3, $4, $5, $6, $7, $8, 'active', TRUE)
    `, [ad.title, slugify(ad.title), ad.description, ad.price, ad.category, ad.city, ad.condition, ad.image_url]);
  }
  console.log('Örnek ilanlar eklendi. Bu kayıtlar arayüz demosu içindir ve kartlarda örnek olarak işaretlenir.');
}

async function start() {
  await initializeDatabase();
  await seedDemoData();
  app.listen(PORT, () => console.log(`Vitrinova ${PORT} portunda çalışıyor.`));
}

start().catch((error) => {
  console.error('Uygulama başlatılamadı:', error.message);
  process.exit(1);
});

process.on('SIGTERM', async () => {
  try { await pool.end(); } finally { process.exit(0); }
});
