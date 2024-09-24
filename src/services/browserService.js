const storageService = require('./storageService');
const logger = require('../utils/logger');
const config = require('../config/default');
const axios = require('axios');
const puppeteer = require('puppeteer-real-browser'); // puppeteer-real-browser'ı import edin
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

/**
 * Tarayıcıyı başlatır ve sayfa nesnesini döner.
 * @param {string} browserProfilePath - Tarayıcı profili yolu.
 * @param {object} proxy - Proxy ayarları.
 * @returns {object} - Browser ve Page nesneleri.
 */
async function launchBrowser(browserProfilePath, proxy) {
  try {
    const args = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--single-process', // Linux sistemlerde önemli olabilir
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
      headless: false, // Tarayıcının görünmesini istiyorsanız false yapın
      args: args,
      userDataDir: browserProfilePath || undefined, // Kullanıcı profili yolu
      defaultViewport: null, // Tam ekran tarama için
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

/**
 * Sayfa ayarlarını yapar (örn. viewport, kullanıcı ajanı vb.)
 * @param {object} page - Puppeteer sayfa nesnesi.
 */
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

/**
 * Giriş işlemi yapar.
 * @param {object} page - Puppeteer sayfa nesnesi.
 * @param {object} login - Giriş bilgileri.
 */
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

/**
 * Cloudflare korumasını atlar.
 * @param {object} page - Puppeteer sayfa nesnesi.
 * @param {string} url - Hedef URL.
 */
async function handleCloudflare(page, url) {
  try {
    await page.goto(url, { waitUntil: 'networkidle2' });
    // Cloudflare çözümü veya başka korumaları atlamak için gerekli kodlar
    // Örneğin, puppeteer-extra-plugin-stealth kullanıyorsanız, bazı korumalar otomatik geçilebilir
    // Ek olarak, gerekli ise captcha çözümü gibi işlemler yapılabilir
  } catch (error) {
    logger.error(`Cloudflare atlanırken hata oluştu (${url}):`, error);
    throw error;
  }
}

/**
 * Sayfadaki pop-up'ları kapatır.
 * @param {object} page - Puppeteer sayfa nesnesi.
 */
async function handlePopups(page) {
  try {
    // Pop-up'ları kapatmak için gerekli kodlar
    // Örneğin, belirli butonları tıklamak veya modalları kapatmak
    await page.evaluate(() => {
      const closeButtons = document.querySelectorAll('.close, .dismiss, .modal-close, .popup-close, .btn-close');
      closeButtons.forEach(button => button.click());
    });
    // Bekleme süresi ekleyerek pop-up'ların tamamen kapanmasını sağlayabilirsiniz
    await delay(1000);
  } catch (error) {
    logger.warn('Pop-up kapatılırken hata oluştu:', error);
  }
}

/**
 * Sayfadaki kaynakları (resimler, scriptler vb.) elde eder.
 * @param {object} page - Puppeteer sayfa nesnesi.
 * @returns {array} - Kaynakların URL'leri.
 */
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

/**
 * Sayfadaki tüm bağlantıları elde eder.
 * @param {object} page - Puppeteer sayfa nesnesi.
 * @returns {array} - Bağlantı URL'leri.
 */
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

/**
 * Sayfadaki interaktif elementleri (butonlar, formlar vb.) çıkarır ve kaydeder.
 * @param {object} page - Puppeteer sayfa nesnesi.
 * @param {string} url - Hedef URL.
 */
async function extractAndSaveInteractiveElements(page, url) {
  try {
    logger.debug(`Extracting interactive elements for ${url}`);
    const interactiveElements = await page.evaluate(() => {
      const elements = [];
      // Extract buttons
      document.querySelectorAll('button, input[type="button"], a.btn').forEach(el => {
        elements.push({
          type: 'button',
          text: el.innerText || el.value || '',
          id: el.id || '',
          class: el.className || '',
          href: el.href || '',
        });
      });
      // Extract forms
      document.querySelectorAll('form').forEach(form => {
        const formData = {
          type: 'form',
          id: form.id || '',
          class: form.className || '',
          action: form.action || '',
          method: form.method || '',
          fields: [],
        };
        form.querySelectorAll('input, select, textarea').forEach(field => {
          formData.fields.push({
            type: field.type || field.tagName.toLowerCase(),
            name: field.name || '',
            id: field.id || '',
            class: field.className || '',
          });
        });
        elements.push(formData);
      });
      // Extract modals/popups
      document.querySelectorAll('.modal, .popup, [class*="modal"], [class*="popup"]').forEach(el => {
        elements.push({
          type: 'modal',
          id: el.id || '',
          class: el.className || '',
          content: el.innerHTML || '',
        });
      });
      return elements;
    });

    await storageService.saveInteractiveElements(url, interactiveElements);
    logger.info(`Interactive elements saved for ${url}`);
  } catch (error) {
    logger.error(`Error extracting interactive elements for ${url}: ${error.message}`, { stack: error.stack });
  }
}

/**
 * Sayfadaki simüle edilmiş JSON yanıtlarını çıkarır ve kaydeder.
 * @param {object} page - Puppeteer sayfa nesnesi.
 * @param {string} url - Hedef URL.
 */
async function simulateAndSaveJsonResponses(page, url) {
  try {
    logger.debug(`Simulating JSON responses for ${url}`);
    const jsonResponses = await page.evaluate(() => {
      const responses = [];
      // Simulate API calls
      const apiEndpoints = [
        '/api/users',
        '/api/products',
        '/api/orders',
      ];
      apiEndpoints.forEach(endpoint => {
        responses.push({
          url: new URL(endpoint, window.location.origin).href,
          data: {
            // Simulated data
            success: true,
            data: [
              { id: 1, name: 'Item 1' },
              { id: 2, name: 'Item 2' },
              { id: 3, name: 'Item 3' },
            ],
          },
        });
      });
      return responses;
    });

    for (const response of jsonResponses) {
      await storageService.saveJsonResponse(url, response.url, response.data);
    }
    logger.info(`JSON responses saved for ${url}`);
  } catch (error) {
    logger.error(`Error simulating JSON responses for ${url}: ${error.message}`, { stack: error.stack });
  }
}

/**
 * IP adresini alır.
 * @returns {string} - IP adresi.
 */
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
  extractAndSaveInteractiveElements,
  simulateAndSaveJsonResponses,
};