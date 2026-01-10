import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Tailwind Migration', () => {
    const rootDir = path.resolve(__dirname, '../../..');
    const frameToolDir = path.join(rootDir, 'tools/frame-tool');

    test('Configuration files should exist in root', () => {
        expect(fs.existsSync(path.join(rootDir, 'tailwind.config.js'))).toBe(true);
        expect(fs.existsSync(path.join(rootDir, 'postcss.config.js'))).toBe(true);
    });

    test('Source CSS file should exist', () => {
        expect(fs.existsSync(path.join(frameToolDir, 'src/style.css'))).toBe(true);
    });

    test('HTML should not contain legacy style block', () => {
        const html = fs.readFileSync(path.join(frameToolDir, 'index.html'), 'utf-8');
        expect(html).not.toContain('.controls {');
        expect(html).not.toContain('.workspace {');
        expect(html).not.toContain('background-color: #333;');
    });

    test('HTML should contain Tailwind classes', () => {
        const html = fs.readFileSync(path.join(frameToolDir, 'index.html'), 'utf-8');
        expect(html).toMatch(/class="[^"]*\bflex\b[^"]*"/);
    });
});