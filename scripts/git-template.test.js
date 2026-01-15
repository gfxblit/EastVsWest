import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

describe('Git Commit Template', () => {
    const rootDir = path.resolve(process.cwd());
    const gitMessagePath = path.join(rootDir, '.gitmessage');

    test('should have a .gitmessage file', () => {
        expect(fs.existsSync(gitMessagePath)).toBe(true);
    });

    test('should have the correct template content', () => {
        const content = fs.readFileSync(gitMessagePath, 'utf8');
        expect(content).toContain('<type>: <description>');
        expect(content).toContain('Unit Test Results:');
        expect(content).toContain('E2E Test Results:');
        expect(content).toContain('Footer:');
    });

    test('should have git config commit.template set', () => {
        try {
            const templateConfig = execSync('git config commit.template').toString().trim();
            expect(templateConfig).toBe('.gitmessage');
        } catch (error) {
            throw new Error('git config commit.template is not set');
        }
    });
});
