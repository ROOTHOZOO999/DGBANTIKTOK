#!/usr/bin/env node
/**
 * HOZOO MD - TikTok Report Bot & Live Scraper v3.0.0
 * Multi-Akun Cookie Rotator
 * Dev: dgxeonhozoomd | OWNER: dgxeonhozoomd
 * UPDATE: 2026-11-04
 */

const axios = require('axios');
const chalk = require('chalk');
const Table = require('cli-table3');
const moment = require('moment');
const fs = require('fs');
const readline = require('readline');
const { HttpsProxyAgent } = require('https-proxy-agent');
const WebSocket = require('ws');

// ============================================
// CONFIG LOADER
// ============================================
let config = {
    owner: 'dgxeonhozoomd',
    developer: 'dgxeonhozoomd',
    version: '3.0.0',
    update: '2026-11-04',
    accounts: [],
    reportReasons: []
};

try {
    const rawConfig = fs.readFileSync('./config.json', 'utf8');
    config = { ...config, ...JSON.parse(rawConfig) };
} catch (e) {
    console.log(chalk.yellow('[!] config.json not found, using defaults'));
}

// ============================================
// PROXY MANAGER
// ============================================
class ProxyManager {
    constructor(file = './proxies.txt') {
        this.proxies = [];
        this.currentIndex = 0;
        this.load(file);
    }

    load(file) {
        try {
            const data = fs.readFileSync(file, 'utf8');
            this.proxies = data.split('\n')
                .map(l => l.trim())
                .filter(l => l.length > 0 && !l.startsWith('#'));
            console.log(chalk.green(`[✓] Loaded ${this.proxies.length} proxies from ${file}`));
        } catch (e) {
            console.log(chalk.red(`[✗] Failed to load proxies: ${e.message}`));
            this.proxies = [];
        }
    }

    getNext() {
        if (this.proxies.length === 0) return null;
        const proxy = this.proxies[this.currentIndex];
        this.currentIndex = (this.currentIndex + 1) % this.proxies.length;
        return proxy;
    }

    getAgent() {
        const proxy = this.getNext();
        if (!proxy) return null;
        try {
            return new HttpsProxyAgent(`http://${proxy}`);
        } catch (e) {
            return null;
        }
    }

    size() {
        return this.proxies.length;
    }
}

const proxyManager = new ProxyManager();

// ============================================
// ACCOUNT MANAGER (MULTI-AKUN COOKIE ROTATOR)
// ============================================
class AccountManager {
    constructor(accounts = []) {
        this.accounts = accounts.map((acc, i) => ({
            ...acc,
            index: i,
            failCount: 0,
            lastUsed: 0,
            cooldownUntil: 0
        }));
        this.currentIndex = 0;
    }

    size() {
        return this.accounts.length;
    }

    // Get akun berikutnya yang ga cooldown
    getNext() {
        if (this.accounts.length === 0) return null;

        const now = Date.now();
        for (let i = 0; i < this.accounts.length; i++) {
            const idx = (this.currentIndex + i) % this.accounts.length;
            const acc = this.accounts[idx];
            if (now >= acc.cooldownUntil) {
                this.currentIndex = (idx + 1) % this.accounts.length;
                acc.lastUsed = now;
                acc.failCount = 0;
                return acc;
            }
        }

        // Semua cooldown, ambil yang paling cepat ready
        let earliest = this.accounts[0];
        for (const acc of this.accounts) {
            if (acc.cooldownUntil < earliest.cooldownUntil) earliest = acc;
        }
        this.currentIndex = (earliest.index + 1) % this.accounts.length;
        return earliest;
    }

    markFailed(acc, reason = 'rate_limit') {
        if (!acc) return;
        acc.failCount++;
        const cooldownMs = acc.failCount >= 3 ? 60000 : 15000;
        acc.cooldownUntil = Date.now() + cooldownMs;
    }

    markSuccess(acc) {
        if (!acc) return;
        acc.failCount = 0;
    }

    status() {
        const now = Date.now();
        return this.accounts.map(acc => ({
            label: acc.label,
            failCount: acc.failCount,
            cooldown: acc.cooldownUntil > now
                ? `${Math.ceil((acc.cooldownUntil - now) / 1000)}s`
                : 'READY'
        }));
    }
}

const accountManager = new AccountManager(config.accounts || []);

// ============================================
// DISPLAY HELPERS
// ============================================
function clearScreen() {
    process.stdout.write('\x1Bc');
}

function getClock() {
    const now = moment();
    return {
        date: now.format('dddd, DD MMMM YYYY'),
        time: now.format('HH:mm:ss'),
        timezone: now.format('Z')
    };
}

function printHeader() {
    const clock = getClock();
    console.log(chalk.cyan('╔══════════════════════════════════════════════════════════════════════════╗'));
    console.log(chalk.cyan('║') + chalk.bold.white('                 HOZOO MD - TIKTOK REPORT TOOL v3.0.0                      ') + chalk.cyan('║'));
    console.log(chalk.cyan('╠══════════════════════════════════════════════════════════════════════════╣'));
    console.log(chalk.cyan('║') + chalk.gray(` Dev    : ${config.developer.padEnd(58)}`) + chalk.cyan('║'));
    console.log(chalk.cyan('║') + chalk.gray(` OWNER  : ${config.owner.padEnd(58)}`) + chalk.cyan('║'));
    console.log(chalk.cyan('║') + chalk.gray(` Version: ${config.version.padEnd(58)}`) + chalk.cyan('║'));
    console.log(chalk.cyan('║') + chalk.gray(` Update : ${config.update.padEnd(58)}`) + chalk.cyan('║'));
    console.log(chalk.cyan('╠══════════════════════════════════════════════════════════════════════════╣'));
    console.log(chalk.cyan('║') + chalk.green(` 📅 ${clock.date.padEnd(58)}`) + chalk.cyan('║'));
    console.log(chalk.cyan('║') + chalk.green(` 🕐 ${clock.time}  (UTC${clock.timezone})${' '.repeat(40)}`) + chalk.cyan('║'));
    console.log(chalk.cyan('║') + chalk.magenta(` 👤 Akun : ${accountManager.size()} | Proxy: ${proxyManager.size()}${' '.repeat(28)}`) + chalk.cyan('║'));
    console.log(chalk.cyan('╚══════════════════════════════════════════════════════════════════════════╝'));
    console.log('');
}

function printMenu() {
    const menu = new Table({
        head: [chalk.cyan('No'), chalk.cyan('Menu'), chalk.cyan('Deskripsi')],
        colWidths: [6, 28, 55],
        style: { head: [], border: ['cyan'] }
    });

    menu.push(
        ['1', chalk.yellow('BAN TIKTOK'), 'Report akun TikTok massal pake User ID'],
        ['2', chalk.yellow('BAN LIVE'), 'Report live TikTok pake Room ID'],
        ['3', chalk.yellow('SCRAPING TIKTOK'), 'Scrape info akun via link/username'],
        ['4', chalk.yellow('SCRAPING LIVE'), 'Scrape komentar live real-time'],
        ['5', chalk.yellow('REPORT DLL'), 'Report dengan jenis random dari list'],
        ['6', chalk.yellow('REPORT TANPA BERHENTI'), 'Loop report terus-terusan ke target'],
        ['7', chalk.yellow('STATUS PROXY'), 'Cek jumlah dan status proxy'],
        ['8', chalk.yellow('STATUS AKUN'), 'Cek status akun TikTok bot'],
        ['9', chalk.yellow('RELOAD PROXY'), 'Reload proxies.txt'],
        ['10', chalk.yellow('CLEAR SCREEN'), 'Bersihin layar'],
        ['0', chalk.red('EXIT'), 'Keluar dari tool']
    );

    console.log(menu.toString());
    console.log('');
}

// ============================================
// READLINE INTERFACE
// ============================================
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function ask(question) {
    return new Promise((resolve) => {
        rl.question(chalk.cyan('└─> ') + chalk.white(question) + ' ', resolve);
    });
}

// ============================================
// TIKTOK API HELPERS (COOKIE-AWARE)
// ============================================
const BASE_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Origin': 'https://www.tiktok.com',
    'Referer': 'https://www.tiktok.com/'
};

function buildHeaders(account) {
    const headers = { ...BASE_HEADERS };
    if (account && account.cookie) {
        headers['Cookie'] = account.cookie;
    }
    return headers;
}

async function getUserIdFromUsername(username) {
    const acc = accountManager.getNext();
    try {
        const agent = proxyManager.getAgent();
        const url = `https://www.tiktok.com/@${username.replace('@', '')}`;
        const resp = await axios.get(url, {
            headers: buildHeaders(acc),
            httpsAgent: agent || undefined,
            timeout: 15000,
            maxRedirects: 3
        });
        const match = resp.data.match(/"user":\{"id":"(\d+)"/);
        if (match) { accountManager.markSuccess(acc); return match[1]; }
        const match2 = resp.data.match(/"userId":"(\d+)"/);
        if (match2) { accountManager.markSuccess(acc); return match2[1]; }
        accountManager.markFailed(acc);
        return null;
    } catch (e) {
        accountManager.markFailed(acc);
        return null;
    }
}

async function getRoomIdFromUsername(username) {
    const acc = accountManager.getNext();
    try {
        const agent = proxyManager.getAgent();
        const url = `https://www.tiktok.com/@${username.replace('@', '')}/live`;
        const resp = await axios.get(url, {
            headers: buildHeaders(acc),
            httpsAgent: agent || undefined,
            timeout: 15000
        });
        const match = resp.data.match(/"roomId":"(\d+)"/);
        if (match) { accountManager.markSuccess(acc); return match[1]; }
        const match2 = resp.data.match(/room_id=(\d+)/);
        if (match2) { accountManager.markSuccess(acc); return match2[1]; }
        accountManager.markFailed(acc);
        return null;
    } catch (e) {
        accountManager.markFailed(acc);
        return null;
    }
}

async function sendReport(targetId, targetType, reason) {
    const acc = accountManager.getNext();
    const agent = proxyManager.getAgent();
    const payload = {
        object_id: targetId,
        object_type: targetType,
        report_type: reason,
        report_reason: reason,
        aid: 1459,
        app_name: 'tiktok_web',
        device_platform: 'web'
    };

    try {
        const resp = await axios.post(
            'https://www.tiktok.com/api/report/submit/',
            new URLSearchParams(payload).toString(),
            {
                headers: {
                    ...buildHeaders(acc),
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                httpsAgent: agent || undefined,
                timeout: 10000
            }
        );
        const ok = resp.data?.status_code === 0 || resp.status === 200;
        if (ok) accountManager.markSuccess(acc);
        else accountManager.markFailed(acc);
        return { success: ok, data: resp.data, account: acc?.label || '-' };
    } catch (e) {
        accountManager.markFailed(acc);
        return { success: false, error: e.message, account: acc?.label || '-' };
    }
}

// ============================================
// FEATURE 1: BAN TIKTOK
// ============================================
async function featureBanTiktok() {
    console.log(chalk.yellow('\n[ BAN TIKTOK - MASS REPORT ACCOUNT ]\n'));
    const input = await ask('Masukin User ID / Username TikTok target:');
    const countStr = await ask('Jumlah report (default 50):');
    const count = parseInt(countStr) || 50;

    let userId = input;
    if (isNaN(input)) {
        console.log(chalk.gray('[*] Resolving username ke User ID...'));
        userId = await getUserIdFromUsername(input);
        if (!userId) {
            console.log(chalk.red('[✗] Gagal resolve User ID.'));
            return;
        }
        console.log(chalk.green(`[✓] User ID: ${userId}`));
    }

    console.log(chalk.yellow(`\n[*] Mengirim ${count} report...\n`));
    let success = 0, failed = 0;

    for (let i = 0; i < count; i++) {
        const reason = config.reportReasons[Math.floor(Math.random() * config.reportReasons.length)];
        const r = await sendReport(userId, 1, reason);
        if (r.success) { success++; console.log(chalk.green(`[${i+1}/${count}] ✓ ${reason} (${r.account})`)); }
        else { failed++; console.log(chalk.red(`[${i+1}/${count}] ✗ ${reason} (${r.account}) - ${r.error || 'fail'}`)); }
        await new Promise(r => setTimeout(r, 300 + Math.random() * 500));
    }

    console.log(chalk.cyan(`\n[✓] Selesai. Success: ${success}, Failed: ${failed}\n`));
}

// ============================================
// FEATURE 2: BAN LIVE
// ============================================
async function featureBanLive() {
    console.log(chalk.yellow('\n[ BAN LIVE - REPORT LIVE ROOM ]\n'));
    const roomId = await ask('Masukin Room ID Live TikTok:');
    const countStr = await ask('Jumlah report (default 50):');
    const count = parseInt(countStr) || 50;

    console.log(chalk.yellow(`\n[*] Mengirim ${count} report...\n`));
    let success = 0, failed = 0;

    for (let i = 0; i < count; i++) {
        const reason = config.reportReasons[Math.floor(Math.random() * config.reportReasons.length)];
        const r = await sendReport(roomId, 2, reason);
        if (r.success) { success++; console.log(chalk.green(`[${i+1}/${count}] ✓ ${reason} (${r.account})`)); }
        else { failed++; console.log(chalk.red(`[${i+1}/${count}] ✗ ${reason} (${r.account})`)); }
        await new Promise(r => setTimeout(r, 300 + Math.random() * 500));
    }

    console.log(chalk.cyan(`\n[✓] Selesai. Success: ${success}, Failed: ${failed}\n`));
}

// ============================================
// FEATURE 3: SCRAPING TIKTOK ACCOUNT
// ============================================
async function featureScrapeTiktok() {
    console.log(chalk.yellow('\n[ SCRAPING TIKTOK ACCOUNT ]\n'));
    const input = await ask('Masukin link profil / username:');
    const username = input.includes('tiktok.com/@')
        ? input.split('@')[1].split('/')[0].split('?')[0]
        : input.replace('@', '');

    console.log(chalk.gray(`[*] Scraping @${username}...\n`));

    try {
        const acc = accountManager.getNext();
        const agent = proxyManager.getAgent();
        const url = `https://www.tiktok.com/@${username}`;
        const resp = await axios.get(url, {
            headers: buildHeaders(acc),
            httpsAgent: agent || undefined,
            timeout: 15000
        });
        const html = resp.data;
        const extract = (regex, fallback = 'N/A') => {
            const m = html.match(regex);
            return m ? m[1] : fallback;
        };

        const data = {
            'Username': `@${username}`,
            'User ID': extract(/"user":\{"id":"(\d+)"/),
            'Nickname': extract(/"nickname":"([^"]+)"/),
            'Followers': extract(/"followerCount":(\d+)/),
            'Following': extract(/"followingCount":(\d+)/),
            'Likes': extract(/"heartCount":(\d+)/),
            'Videos': extract(/"videoCount":(\d+)/),
            'Bio': extract(/"signature":"([^"]*)"/),
            'Verified': extract(/"verified":(true|false)/)
        };

        const table = new Table({
            head: [chalk.cyan('Field'), chalk.cyan('Value')],
            colWidths: [20, 50],
            style: { head: [], border: ['cyan'] }
        });

        for (const [k, v] of Object.entries(data)) table.push([chalk.white(k), chalk.gray(v)]);
        console.log(table.toString());
        console.log('');
    } catch (e) {
        console.log(chalk.red(`[✗] Scraping gagal: ${e.message}\n`));
    }
}

// ============================================
// FEATURE 4: SCRAPING LIVE
// ============================================
async function featureScrapeLive() {
    console.log(chalk.yellow('\n[ SCRAPING LIVE - REAL-TIME COMMENTS ]\n'));
    const username = await ask('Masukin username TikTok yang lagi live:');
    const cleanUser = username.replace('@', '').trim();

    console.log(chalk.gray(`[*] Mencari Room ID untuk @${cleanUser}...`));
    const roomId = await getRoomIdFromUsername(cleanUser);

    if (!roomId) {
        console.log(chalk.red('[✗] Gagal dapet Room ID.\n'));
        return;
    }

    console.log(chalk.green(`[✓] Room ID: ${roomId}`));
    console.log(chalk.gray('Tekan CTRL+C untuk stop.\n'));

    try {
        const acc = accountManager.getNext();
        const ws = new WebSocket('wss://webcast.tiktok.com/webcast/im/ws/', {
            headers: {
                ...buildHeaders(acc),
                'Sec-WebSocket-Protocol': 'pbbp2'
            },
            agent: proxyManager.getAgent() || undefined
        });

        let commentCount = 0;

        ws.on('open', () => {
            console.log(chalk.green('[✓] WebSocket connected!\n'));
            const pingInterval = setInterval(() => {
                if (ws.readyState === WebSocket.OPEN) ws.ping();
            }, 30000);
            ws.on('close', () => clearInterval(pingInterval));
        });

        ws.on('message', (data) => {
            try {
                const text = data.toString('utf8');
                if (text.includes('"comment"') || text.includes('"text"')) {
                    let parsed;
                    try { parsed = JSON.parse(text); } catch {
                        const m = text.match(/[\x20-\x7E]{10,}/g);
                        if (m) console.log(chalk.gray(`[RAW] ${m.slice(0,3).join(' | ')}`));
                        return;
                    }
                    const user = parsed.user?.nickname || parsed.user?.uniqueId || 'unknown';
                    const comment = parsed.text || parsed.comment || '';
                    if (comment) {
                        commentCount++;
                        console.log(chalk.cyan(`[${commentCount}] `) + chalk.white(`@${user}: `) + chalk.gray(comment));
                    }
                }
            } catch (e) {}
        });

        ws.on('error', (err) => console.log(chalk.red(`[✗] WS: ${err.message}`)));

        await new Promise((resolve) => {
            process.on('SIGINT', () => { ws.close(); resolve(); });
        });
    } catch (e) {
        console.log(chalk.red(`[✗] Gagal connect: ${e.message}\n`));
    }
}

// ============================================
// FEATURE 5: REPORT DLL
// ============================================
async function featureReportDll() {
    console.log(chalk.yellow('\n[ REPORT DLL - RANDOM REASON ]\n'));
    const targetId = await ask('Masukin User ID target:');
    const typeStr = await ask('Tipe target (1=User, 2=Live, 3=Video):');
    const targetType = parseInt(typeStr) || 1;
    const countStr = await ask('Jumlah report (default 100):');
    const count = parseInt(countStr) || 100;

    console.log(chalk.yellow(`\n[*] ${count} report alasan random...\n`));
    let success = 0, failed = 0;

    for (let i = 0; i < count; i++) {
        const reason = config.reportReasons[Math.floor(Math.random() * config.reportReasons.length)];
        const r = await sendReport(targetId, targetType, reason);
        if (r.success) { success++; console.log(chalk.green(`[${i+1}/${count}] ✓ ${reason} (${r.account})`)); }
        else { failed++; console.log(chalk.red(`[${i+1}/${count}] ✗ ${reason} (${r.account})`)); }
        await new Promise(r => setTimeout(r, 200 + Math.random() * 400));
    }

    console.log(chalk.cyan(`\n[✓] Selesai. Success: ${success}, Failed: ${failed}\n`));
}

// ============================================
// FEATURE 6: REPORT TANPA BERHENTI
// ============================================
async function featureReportLoop() {
    console.log(chalk.yellow('\n[ REPORT TANPA BERHENTI - INFINITE LOOP ]\n'));
    const targetId = await ask('Masukin User ID / Room ID target:');
    const typeStr = await ask('Tipe (1=User, 2=Live, 3=Video):');
    const targetType = parseInt(typeStr) || 1;

    console.log(chalk.red('\n[!] MODE INFINITE - Tekan CTRL+C untuk stop\n'));
    let count = 0;
    let running = true;

    process.on('SIGINT', () => {
        running = false;
        console.log(chalk.yellow(`\n\n[!] Stopped. Total: ${count}\n`));
        rl.close();
        process.exit(0);
    });

    while (running) {
        const reason = config.reportReasons[Math.floor(Math.random() * config.reportReasons.length)];
        const r = await sendReport(targetId, targetType, reason);
        count++;
        const status = r.success ? chalk.green('✓') : chalk.red('✗');
        console.log(`${status} [${count}] ${reason} | akun:${r.account} | ${moment().format('HH:mm:ss')}`);
        await new Promise(r => setTimeout(r, 300 + Math.random() * 700));
    }
}

// ============================================
// FEATURE 7: STATUS PROXY
// ============================================
function featureProxyStatus() {
    console.log(chalk.yellow('\n[ STATUS PROXY ]\n'));
    console.log(chalk.white(`Total proxy: ${chalk.green(proxyManager.size())}`));
    console.log(chalk.white(`File: ${chalk.gray('./proxies.txt')}\n`));
    if (proxyManager.size() === 0) {
        console.log(chalk.red('[!] Tidak ada proxy.\n'));
    }
}

// ============================================
// FEATURE 8: STATUS AKUN
// ============================================
function featureAccountStatus() {
    console.log(chalk.yellow('\n[ STATUS AKUN TIKTOK BOT ]\n'));

    if (accountManager.size() === 0) {
        console.log(chalk.red('[!] Tidak ada akun. Isi accounts di config.json.\n'));
        return;
    }

    const table = new Table({
        head: [chalk.cyan('No'), chalk.cyan('Label'), chalk.cyan('Fail Count'), chalk.cyan('Status')],
        colWidths: [6, 25, 15, 20],
        style: { head: [], border: ['cyan'] }
    });

    accountManager.status().forEach((a, i) => {
        const color = a.cooldown === 'READY' ? chalk.green : chalk.red;
        table.push([i + 1, a.label, a.failCount, color(a.cooldown)]);
    });

    console.log(table.toString());
    console.log('');
}

// ============================================
// MAIN LOOP
// ============================================
async function main() {
    clearScreen();

    while (true) {
        printHeader();
        printMenu();

        const choice = await ask('Pilih menu [0-10]:');

        switch (choice.trim()) {
            case '1': await featureBanTiktok(); break;
            case '2': await featureBanLive(); break;
            case '3': await featureScrapeTiktok(); break;
            case '4': await featureScrapeLive(); break;
            case '5': await featureReportDll(); break;
            case '6': await featureReportLoop(); break;
            case '7': featureProxyStatus(); break;
            case '8': featureAccountStatus(); break;
            case '9': proxyManager.load('./proxies.txt'); break;
            case '10': clearScreen(); break;
            case '0':
                console.log(chalk.yellow('\n[!] Keluar.\n'));
                rl.close();
                process.exit(0);
            default:
                console.log(chalk.red('\n[✗] Pilihan tidak valid.\n'));
        }

        await ask('Tekan ENTER untuk kembali ke menu...');
        clearScreen();
    }
}

main().catch((e) => {
    console.log(chalk.red(`[FATAL] ${e.message}`));
    process.exit(1);
});
