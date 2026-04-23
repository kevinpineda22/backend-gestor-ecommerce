const fs = require('fs');
let content = fs.readFileSync('gestor-ecommerce/components/BannerManager.jsx', 'utf8');
content = content.replace('import DiscountTilesManager from \"./DiscountTilesManager\";', '');
fs.writeFileSync('gestor-ecommerce/components/BannerManager.jsx', content, 'utf8');
