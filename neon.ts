import { defineConfig } from '@neon/config/v1';

export default defineConfig({
  auth: true,
  preview: {
    buckets: {
      bucket: { access: 'private' },
    },
    functions: {
      api: { name: 'api', source: './hello.ts' },
    },
  },
});
