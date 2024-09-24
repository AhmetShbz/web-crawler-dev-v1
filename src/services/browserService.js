const storageService = require('./storageService');
const logger = require('../utils/logger');
const config = require('../config/default');
const axios = require('axios');
const puppeteer = require('puppeteer-real-browser');
const puppeteerExtra = require('puppeteer-extra');
const RecaptchaPlugin = require('puppeteer-extra-plugin-recaptcha');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteerExtra.use(StealthPlugin());
puppeteerExtra.use(
  RecaptchaPlugin({
    provider: { id: '2captcha', token: config.recaptcha.apiKey },
    visualFeedback: true,
  })
);

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function launchBrowser(browserProfilePath, proxy) {
  try {
    const args = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--single-process',
      '--disable-gpu',
      '--disable-infobars',
      '--window-position=0,0',
      '--ignore-certifcate-errors',
      '--ignore-certifcate-errors-spki-list',
    ];

    if (proxy && proxy.host && proxy.port) {
      args.push(`--proxy-server=${proxy.host}:${proxy.port}`);
    }

    const launchOptions = {
      headless: false,
      args: args,
      userDataDir: browserProfilePath || undefined,
      defaultViewport: null,
    };

    const browser = await puppeteerExtra.launch(launchOptions);
    const page = await browser.newPage();

    if (proxy && proxy.username && proxy.password) {
      await page.authenticate({
        username: proxy.username,
        password: proxy.password,
      });
    }

    return { browser, page };
  } catch (error) {
    logger.error('Tarayıcı başlatılırken hata oluştu:', error);
    throw error;
  }
}

async function setupPage(page) {
  try {
    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent(config.crawler.userAgent);
    // Diğer sayfa ayarları...
  } catch (error) {
    logger.error('Sayfa ayarlanırken hata oluştu:', error);
    throw error;
  }
}

async function performLogin(page, login) {
  try {
    await page.goto(login.loginUrl, { waitUntil: 'networkidle2' });
    await page.type('input[name="username"]', login.username, { delay: 100 });
    await page.type('input[name="password"]', login.password, { delay: 100 });
    await Promise.all([
      page.click('button[type="submit"]'),
      page.waitForNavigation({ waitUntil: 'networkidle2' }),
    ]);
    logger.info('Giriş başarılı.');
  } catch (error) {
    logger.error('Giriş işlemi sırasında hata oluştu:', error);
    throw error;
  }
}

async function handleCloudflare(page, url) {
  try {
    await page.goto(url, { waitUntil: 'networkidle2' });
    // Cloudflare çözümü veya başka korumaları atlamak için gerekli kodlar
  } catch (error) {
    logger.error(`Cloudflare atlanırken hata oluştu (${url}):`, error);
    throw error;
  }
}

async function handlePopups(page) {
  try {
    await page.evaluate(() => {
      const closeButtons = document.querySelectorAll('.close, .dismiss, .modal-close, .popup-close, .btn-close');
      closeButtons.forEach(button => button.click());
    });
    await delay(1000);
  } catch (error) {
    logger.warn('Pop-up kapatılırken hata oluştu:', error);
  }
}

async function getPageResources(page) {
  try {
    const resources = await page.evaluate(() => {
      const resourceUrls = [];
      document.querySelectorAll('img, script, link').forEach(el => {
        if (el.src) resourceUrls.push(el.src);
        if (el.href) resourceUrls.push(el.href);
      });
      return resourceUrls;
    });
    return resources;
  } catch (error) {
    logger.error('Sayfa kaynakları alınırken hata oluştu:', error);
    return [];
  }
}

async function getPageLinks(page) {
  try {
    const links = await page.evaluate(() => {
      const anchorElements = Array.from(document.querySelectorAll('a'));
      return anchorElements
        .map(anchor => anchor.href)
        .filter(href => href.startsWith('http'));
    });
    return links;
  } catch (error) {
    logger.error('Sayfa bağlantıları alınırken hata oluştu:', error);
    return [];
  }
}

async function verifyProxyUsage(proxy) {
  const browser = await puppeteer.launch({
    args: [`--proxy-server=${proxy.host}:${proxy.port}`],
    headless: true
  });
  
  try {
    const page = await browser.newPage();
    
    if (proxy.username && proxy.password) {
      await page.authenticate({
        username: proxy.username,
        password: proxy.password
      });
    }
    
    await page.goto('https://api.ipify.org?format=json');
    const content = await page.content();
    const match = content.match(/"ip"\s*:\s*"(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})"/);
    
    if (match) {
      return match[1]; // IP adresi
    } else {
      return null;
    }
  } catch (error) {
    console.error('Proxy doğrulama hatası:', error);
    return null;
  } finally {
    await browser.close();
  }
}

async function getIpAddress() {
  try {
    const response = await axios.get('https://api.ipify.org?format=json');
    return response.data.ip;
  } catch (error) {
    logger.error(`Error getting IP address: ${error.message}`);
    return 'Unknown';
  }
}

module.exports = {
  launchBrowser,
  setupPage,
  performLogin,
  handleCloudflare,
  handlePopups,
  getPageResources,
  getPageLinks,
  verifyProxyUsage,
  getIpAddress,
};