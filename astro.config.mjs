import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://groupsmix.com',
  output: 'static',
  build: {
    format: 'directory'
  }
});
