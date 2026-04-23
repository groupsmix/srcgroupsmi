import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://groupsmix.com',
  output: 'static',
  build: {
    format: 'directory',
    // Emit every bundled <style> block as an external <link rel="stylesheet">
    // instead of inlining small ones into the HTML. Required for the CSP
    // hardening pass: inline <style> elements need style-src 'unsafe-inline'
    // (or a nonce), while external stylesheets only need 'self'.
    inlineStylesheets: 'never'
  }
});
