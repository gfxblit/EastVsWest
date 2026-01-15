import puppeteer from 'puppeteer';
import { startViteServer, stopViteServer } from './helpers/vite-server.js';
import { getPuppeteerConfig } from './helpers/puppeteer-config.js';

describe('Debug UI E2E', () => {
    let browser;
    let page;
    let baseUrl;

    beforeAll(async () => {
        baseUrl = await startViteServer();
        browser = await puppeteer.launch(getPuppeteerConfig());
        page = await browser.newPage();
    });

    afterAll(async () => {
        if (browser) {
            await browser.close();
        }
        await stopViteServer();
    });

    test('Should allow configuring weapon stats in real-time', async () => {
        await page.goto(baseUrl);
        await page.waitForSelector('body.loaded');

        // Mock network and game to bypass Supabase
        await page.evaluate(() => {
            window.app.network = {
                playerId: 'local-player',
                isHost: true,
                initialize: () => { },
                on: () => { },
                hostGame: async () => ({ session: { id: 's1', join_code: 'DEBUG1' }, player: { id: 'local-player' } }),
                startGame: async () => { },
                startPeriodicPlayerStateWrite: () => { },
                broadcastPlayerStateUpdate: () => { },
                writePlayerStateToDB: async () => { },
                send: () => { },
                disconnect: () => { },
            };

            window.app.playersSnapshot = {
                ready: async () => { },
                getPlayers: () => new Map([['local-player', {
                    player_id: 'local-player',
                    player_name: 'DebugUser',
                    health: 100,
                    position_x: 100,
                    position_y: 100
                }]]),
                getInterpolatedPlayerState: () => ({ x: 100, y: 100 }),
                destroy: () => { }
            };

            // Mock hostGame to immediately start
            window.app.hostGame = async function () {
                this.ui.showJoinCode('DEBUG1');
                this.startGame();
            };
        });

        // Start game
        await page.click('#host-game-btn');
        await page.waitForSelector('#game-screen.active');

        // Wait for game initialization
        await page.waitForFunction(() => window.game && window.game.state.isRunning);

        // Simulate pressing 'O' to toggle Debug UI
        await page.keyboard.press('o');

        // Check if debug UI overlay appears
        await page.waitForSelector('#debug-ui-overlay', { visible: true, timeout: 5000 });

        // Select 'SPEAR' (assuming it's the first or available)
        await page.select('#debug-weapon-select', 'SPEAR');

        // Change damage to 999
        await page.evaluate(() => {
            const input = document.getElementById('debug-baseDamage');
            input.value = '999';
            input.dispatchEvent(new Event('input'));
        });

        // Verify UI value persistence (simple check)
        const spearDamage = await page.evaluate(() => {
            return document.getElementById('debug-baseDamage').value;
        });

        expect(spearDamage).toBe('999');

        // Close Debug UI
        await page.keyboard.press('o');
        await page.waitForSelector('#debug-ui-overlay', { hidden: true });

        // Open again
        await page.keyboard.press('o');
        await page.waitForSelector('#debug-ui-overlay', { visible: true });

        // Check if value is still 999
        const damageAfterReopen = await page.evaluate(() => {
            return document.getElementById('debug-baseDamage').value;
        });
        expect(damageAfterReopen).toBe('999');
    });

    test('Should allow toggling Debug UI via touch button on small screens', async () => {
        // Set viewport to mobile size
        await page.setViewport({ width: 400, height: 800, isMobile: true, hasTouch: true });

        await page.goto(`${baseUrl}?debug=true`);
        await page.waitForSelector('body.loaded');

        // Setup mocks after page load
        await page.evaluate(() => {
            window.app.network = {
                playerId: 'local-player',
                isHost: true,
                initialize: () => { },
                on: () => { },
                hostGame: async () => ({ session: { id: 's1', join_code: 'DEBUG2' }, player: { id: 'local-player' } }),
                startGame: async () => { },
                startPeriodicPlayerStateWrite: () => { },
                broadcastPlayerStateUpdate: () => { },
                writePlayerStateToDB: async () => { },
                send: () => { },
                disconnect: () => { },
            };

            window.app.playersSnapshot = {
                ready: async () => { },
                getPlayers: () => new Map([['local-player', {
                    player_id: 'local-player',
                    player_name: 'TouchUser',
                    health: 100,
                    position_x: 100,
                    position_y: 100
                }]]),
                getInterpolatedPlayerState: () => ({ x: 100, y: 100 }),
                destroy: () => { }
            };

            // Mock hostGame to immediately start
            window.app.hostGame = async function () {
                this.ui.showJoinCode('DEBUG2');
                this.startGame();
            };
        });

        // Start game
        await page.click('#host-game-btn');
        await page.waitForSelector('#game-screen.active');

        // Wait for game initialization
        await page.waitForFunction(() => window.game && window.game.state.isRunning);

        // Verify debug button is visible
        await page.waitForSelector('#debug-toggle-btn', { visible: true });

        // Tap Debug Button to open
        await page.tap('#debug-toggle-btn');

        // Check if debug UI overlay appears
        await page.waitForFunction(() => {
            const el = document.getElementById('debug-ui-overlay');
            return el && !el.classList.contains('hidden');
        }, { timeout: 5000 });

        // Wait a bit for stabilization
        await new Promise(resolve => setTimeout(resolve, 100));

        // Tap Debug Button again to close
        await page.tap('#debug-toggle-btn');

                // Wait for it to be hidden

                await page.waitForFunction(() => {

                    const el = document.getElementById('debug-ui-overlay');

                    return !el || el.classList.contains('hidden');

                }, { timeout: 5000 });

            });

        

            test('Should allow minimizing and maximizing the debug panel', async () => {

                await page.goto(baseUrl);

                await page.waitForSelector('body.loaded');

        

                // Setup minimal mocks

                await page.evaluate(() => {

                    window.app.network = {

                        playerId: 'host',

                        isHost: true,

                        initialize: () => { },

                        on: () => { },

                        hostGame: async () => ({ session: { id: 's1', join_code: 'DEBUG3' }, player: { id: 'host' } }),

                        startGame: () => { },

                        startPeriodicPlayerStateWrite: () => { },

                        broadcastPlayerStateUpdate: () => { },

                        writePlayerStateToDB: async () => { },

                        send: () => { },

                        disconnect: () => { },

                    };

                    window.app.playersSnapshot = {

                        ready: async () => { },

                        getPlayers: () => new Map(),

                        getInterpolatedPlayerState: () => ({ x: 0, y: 0 }),

                        destroy: () => { }

                    };

                    window.app.hostGame = async function () { this.startGame(); };

                });

        

                // Start game and open debug UI

                await page.click('#host-game-btn');

                await page.keyboard.press('o');

                await page.waitForSelector('#debug-ui-overlay', { visible: true });

        

                // Verify initial state (maximized)

                const isContentVisible = await page.evaluate(() => {

                    const content = document.getElementById('debug-content');

                    return content && !content.classList.contains('hidden');

                });

                expect(isContentVisible).toBe(true);

        

                const initialBtnText = await page.$eval('#debug-minimize-btn', el => el.innerText);

                expect(initialBtnText).toBe('-');

        

                // Minimize

                await page.click('#debug-minimize-btn');

        

                // Verify minimized state

                const isContentHidden = await page.evaluate(() => {

                    const content = document.getElementById('debug-content');

                    return content && content.classList.contains('hidden');

                });

                expect(isContentHidden).toBe(true);

        

                const minimizedBtnText = await page.$eval('#debug-minimize-btn', el => el.innerText);

                expect(minimizedBtnText).toBe('+');

        

                // Maximize

                await page.click('#debug-minimize-btn');

        

                // Verify maximized again

                const isContentVisibleAgain = await page.evaluate(() => {

                    const content = document.getElementById('debug-content');

                    return content && !content.classList.contains('hidden');

                });

                expect(isContentVisibleAgain).toBe(true);

        

                const maximizedBtnText = await page.$eval('#debug-minimize-btn', el => el.innerText);

                expect(maximizedBtnText).toBe('-');

            });

        });

        