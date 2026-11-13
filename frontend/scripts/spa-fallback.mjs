// Static hosts serve a file per path, but the site's routes (/about, /canon) are made in the browser.
// surge.sh serves 200.html for any path it has no file for, so copy the app shell there.
// Other hosts use other names (Netlify and Cloudflare Pages read _redirects, GitHub Pages reads 404.html);
// this one file is all surge needs.
import { copyFileSync } from 'node:fs';

const dist = new URL('../dist/', import.meta.url);
copyFileSync(new URL('index.html', dist), new URL('200.html', dist));
console.log('Wrote dist/200.html (the app shell, served for routes such as /about)');
