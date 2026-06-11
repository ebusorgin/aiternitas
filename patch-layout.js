const fs = require('fs');
let layout = fs.readFileSync('client/src/components/Layout.jsx', 'utf8');

if (!layout.includes('import Footer')) {
  layout = layout.replace("import './Layout.css';", "import './Layout.css';\nimport Footer from './Footer';");
  layout = layout.replace("</main>\n    </div>", "</main>\n      <Footer />\n    </div>");
  fs.writeFileSync('client/src/components/Layout.jsx', layout);
  console.log('Footer added');
} else {
  console.log('Footer already present');
}
