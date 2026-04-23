@
const fs = require('fs');
let code = fs.readFileSync('gestor-ecommerce/components/BannerManager.jsx', 'utf8');
// 1. New Banner button
code = code.replace(/\{activeSection !== 'discount_tiles' && \(\s*<button className="ge-btn" onClick=\{openCreate\}>\+ Nuevo Banner<\/button>\s*\)\}/, '<button className="ge-btn" onClick={openCreate}>+ Nuevo Banner</button>');
// 2. Preview button
code = code.replace(/\{activeSection !== 'discount_tiles' && \(\s*<button\s*className="bm-preview-toggle-btn"[\s\S]*?<\/button>\s*\)\}/, '<button className="bm-preview-toggle-btn" onClick={() => { setShowPreview(true); setCurrentSlide(0); }}>👁️ Vista Previa Tienda</button>');
// 3. List condition
code = code.replace(/\{activeSection !== 'discount_tiles' && \((loading \? \([\s\S]*?)<\/div>\s*\)\}/, '{</div>}');
// And remove the lingering <DiscountTilesManager ... /> component rendering:
code = code.replace(/\{activeSection === 'discount_tiles' && \([\s\S]*?<\/DiscountTilesManager>\s*\)\}/g, '');
fs.writeFileSync('gestor-ecommerce/components/BannerManager.jsx', code);
@