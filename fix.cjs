const fs = require('fs');
let content = fs.readFileSync('gestor-ecommerce/components/BannerManager.jsx', 'utf8');
content = content.replace(
  'const [sliderRes, tilesRes, separatasRes] = await Promise.all([',
  'const [sliderRes, tilesRes, separatasRes, dtilesRes] = await Promise.all(['
);
content = content.replace(
  'fetchBanners("promo_separatas"),\r\n        ]);',
  'fetchBanners("promo_separatas"),\r\n          fetchBanners("discount_tiles"),\r\n        ]);'
);
content = content.replace(
  'fetchBanners("promo_separatas"),\n        ]);',
  'fetchBanners("promo_separatas"),\n          fetchBanners("discount_tiles"),\n        ]);'
);
content = content.replace(
  '...(separatasRes.ok ? separatasRes.data || [] : []),',
  '...(separatasRes.ok ? separatasRes.data || [] : []),\r\n          ...(dtilesRes.ok ? dtilesRes.data || [] : []),'
);
content = content.replace(
  '{/* -- Tiles Descuentos Especiales -- */}\r\n      {activeSection === \'discount_tiles\' && (\r\n        <DiscountTilesManager sedes={sedes} sedeActual={sedeActual} esAdminGlobal={esAdminGlobal} embedded />\r\n      )}',
  ''
);
content = content.replace(
  '{/* -- Tiles Descuentos Especiales -- */}\n      {activeSection === \'discount_tiles\' && (\n        <DiscountTilesManager sedes={sedes} sedeActual={sedeActual} esAdminGlobal={esAdminGlobal} embedded />\n      )}',
  ''
);
content = content.replace(
  'showForm && activeSection !== \'discount_tiles\'',
  'showForm'
);
fs.writeFileSync('gestor-ecommerce/components/BannerManager.jsx', content, 'utf8');
