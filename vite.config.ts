import { defineConfig } from 'vite';
export default defineConfig({
  build: {
    lib: {
      entry: './src/index.ts',
      name: 'PDFHighlightViewer',
      formats: ['es', 'cjs'],
      fileName: (format) => `index.${format === 'es' ? 'esm' : format}.js`,
    },
    rollupOptions: {
      external: ['pdfjs-dist'],
      output: {
        globals: {
          'pdfjs-dist': 'pdfjsLib',
        },
      },
    },
  },
});
