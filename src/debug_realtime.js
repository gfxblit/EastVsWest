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

  // Check production deployment
  console.log('Production deployment:');
  await checkURL('https://gfxblit.github.io/EastVsWest/');
  await checkURL('https://gfxblit.github.io/EastVsWest/assets/index-JUj4HII0.js');

  // Check preview deployment (example PR #38)
  console.log('\nPreview deployment (PR #38):');
  await checkURL('https://gfxblit.github.io/EastVsWest/pr-38/');
  await checkURL('https://gfxblit.github.io/EastVsWest/pr-38/assets/index-JUj4HII0.js');

  console.log('\n=== Analysis ===');
  console.log('With base: "./" (relative paths), assets work for both:');
  console.log('- Production: ./assets/... resolves relative to /EastVsWest/');
  console.log('- Preview: ./assets/... resolves relative to /EastVsWest/pr-XX/');
  console.log('\nThis allows a single build to work for both deployments.');
}

main();
