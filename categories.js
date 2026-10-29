const categories = [
  { slug: 'vasita', name: 'Vasıta', icon: 'car', description: 'Otomobil, motosiklet ve daha fazlası' },
  { slug: 'emlak', name: 'Emlak', icon: 'home', description: 'Satılık ve kiralık yaşam alanları' },
  { slug: 'elektronik', name: 'Elektronik', icon: 'devices', description: 'Telefon, bilgisayar ve teknoloji' },
  { slug: 'ev-yasam', name: 'Ev & Yaşam', icon: 'sofa', description: 'Evin için kullanışlı parçalar' },
  { slug: 'moda', name: 'Moda', icon: 'shirt', description: 'Giyim, ayakkabı ve aksesuar' },
  { slug: 'spor-hobi', name: 'Spor & Hobi', icon: 'bike', description: 'Hobiler ve hareketli yaşam' },
  { slug: 'anne-cocuk', name: 'Anne & Çocuk', icon: 'baby', description: 'Minikler için ihtiyaçlar' },
  { slug: 'is-hizmet', name: 'İş & Hizmet', icon: 'briefcase', description: 'İş ekipmanları ve hizmetler' }
];

const cities = [
  'İstanbul', 'Ankara', 'İzmir', 'Bursa', 'Antalya', 'Adana', 'Konya', 'Gaziantep',
  'Mersin', 'Kayseri', 'Eskişehir', 'Samsun', 'Trabzon', 'Kocaeli', 'Muğla', 'Diğer'
];

const conditions = [
  { value: 'new', label: 'Yeni' },
  { value: 'like-new', label: 'Yeni gibi' },
  { value: 'used', label: 'İkinci el' },
  { value: 'for-parts', label: 'Yedek parça / Onarım' }
];

function categoryBySlug(slug) {
  return categories.find((item) => item.slug === slug);
}

function categoryName(slug) {
  return categoryBySlug(slug)?.name || 'Diğer';
}

function conditionName(value) {
  return conditions.find((item) => item.value === value)?.label || 'Belirtilmemiş';
}

module.exports = { categories, cities, conditions, categoryBySlug, categoryName, conditionName };
