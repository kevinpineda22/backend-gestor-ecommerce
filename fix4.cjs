@
const fs = require('fs');
let code = fs.readFileSync('gestor-ecommerce/components/BannerManager.jsx', 'utf8');
code = code.replace(/\{\/\* ── Tiles Descuentos Especiales ── \*\/\}\s*\{activeSection === 'discount_tiles' && \(\s*<DiscountTilesManager[\s\S]*?\/>\s*\)\}/, '');
code = code.replace(/\{activeSection !== 'discount_tiles' && \(\s*(<button className="ge-btn" onClick=\{openCreate\}>[\s\S]*?)<\/button>\s*\)\}/g, '$1</button>');
code = code.replace(/\{activeSection !== 'discount_tiles' && \(\s*(<button[\s\S]*?bm-preview-toggle-btn[\s\S]*?<\/button>)\s*\)\}/g, '$1');
code = code.replace(/\{activeSection !== 'discount_tiles' && \(\s*loading \? \(/g, '{loading ? (');
code = code.replace(/<\/div>\s*\}\)\)/g, '</div>\n      )}');
fs.writeFileSync('gestor-ecommerce/components/BannerManager.jsx', code);
@