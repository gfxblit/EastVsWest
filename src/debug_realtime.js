// Debug script to test what the deployed page loads
// Run with: node src/debug_realtime.js

import https from 'https';

async function checkURL(url) {
  return new Promise((resolve) => {
    https.get(url, (res) => {
      console.log(`${url}: ${res.statusCode}`);
      resolve(res.statusCode);
    }).on('error', (e) => {
      console.log(`${url}: ERROR - ${e.message}`);
      resolve(null);
    });
  });
}

async function main() {
  console.log('\n=== Checking GitHub Pages Deployment ===\n');

  // Check main page
  await checkURL('https://gfxblit.github.io/EastVsWest/');

  // Check assets with wrong path (what browser tries with current build)
  console.log('\nAssets with absolute paths (current broken behavior):');
  await checkURL('https://gfxblit.github.io/assets/index-JUj4HII0.js');
  await checkURL('https://gfxblit.github.io/assets/index-BxCAtCat.css');

  // Check assets with correct path
  console.log('\nAssets with repo-prefixed paths (correct location):');
  await checkURL('https://gfxblit.github.io/EastVsWest/assets/index-JUj4HII0.js');
  await checkURL('https://gfxblit.github.io/EastVsWest/assets/index-BxCAtCat.css');

  console.log('\n=== Analysis ===');
  console.log('GitHub Pages serves your site at: /EastVsWest/');
  console.log('But Vite builds with asset paths: /assets/...');
  console.log('This causes 404s because browser looks at domain root, not repo subpath.');
  console.log('\nFix: Add base: "/EastVsWest/" to vite.config.js');
}

main();
