const browserService = require('./browserService');
const storageService = require('./storageService');
const logger = require('../utils/logger');
const config = require('../config/default');
const axios = require('axios');

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));


exports.crawlWebsite = async (startUrl, options) => {
    const { maxDepth, maxPages, socketIo, login, browserProfilePath, proxy, waitTime } = options;
  
    let browser, page;
    const visitedUrls = new Set();
    const urlsToVisit = [{ url: startUrl, depth: 0 }];
    let pagesCrawled = 0;
    let successfulPages = 0;
    let failedPages = 0;
    let skippedPages = 0;
    let shouldStop = false;
  
    try {
      ({ browser, page } = await browserService.launchBrowser(browserProfilePath, proxy));
      await browserService.setupPage(page);
  
      if (login) {
        await browserService.performLogin(page, login);
      }
  
      while (urlsToVisit.length > 0 && pagesCrawled < maxPages && !shouldStop) {
        const { url, depth } = urlsToVisit.shift();
  
        if (visitedUrls.has(url) || depth > maxDepth) {
          skippedPages++;
          continue;
        }
  
        try {
          await browserService.handleCloudflare(page, url);
          await browserService.handlePopups(page);
          await delay(waitTime);
  
          const content = await page.content();
          const resources = await browserService.getPageResources(page);
  
          await storageService.savePage(url, content, resources);
  
          visitedUrls.add(url);
          pagesCrawled++;
          successfulPages++;
  
          const progress = (pagesCrawled / maxPages) * 100;
          socketIo.emit('crawl_progress', {
            url,
            pagesCrawled,
            progress,
            successfulPages,
            failedPages,
            skippedPages
          });
  
          const links = await browserService.getPageLinks(page);
  
          for (const link of links) {
            if (!visitedUrls.has(link)) {
              urlsToVisit.push({ url: link, depth: depth + 1 });
            }
          }
  
          await extractAndSaveInteractiveElements(page, url);
          await simulateAndSaveJsonResponses(page, url);
        } catch (error) {
          logger.error(`URL işlenirken hata oluştu (${url}):`, error);
          socketIo.emit('crawl_error', { message: `URL işlenirken hata oluştu (${url}): ${error.message}` });
          failedPages++;
  
          try {
            const partialContent = await page.content();
            await storageService.savePartialPage(url, partialContent);
          } catch (saveError) {
            logger.error(`Kısmi içerik kaydedilirken hata oluştu (${url}):`, saveError);
          }
        }
      }
    } catch (error) {
      logger.error('Tarama işlemi sırasında beklenmeyen bir hata oluştu:', error);
      socketIo.emit('crawl_error', { message: `Beklenmeyen bir hata oluştu: ${error.message}` });
    } finally {
      if (browser) {
        await browser.close().catch((err) => logger.error('Tarayıcı kapatılırken hata oluştu:', err));
      }
    }
  
    socketIo.emit('crawl_complete', { pagesCrawled, successfulPages, failedPages, skippedPages });
  
    return {
      stop: () => {
        shouldStop = true;
        logger.info('Tarama durdurulması istendi.');
      }
    };
  };

async function extractAndSaveInteractiveElements(page, url) {
    try {
        logger.debug(`Extracting interactive elements for ${url}`);
        const interactiveElements = await page.evaluate(() => {
            const elements = [];
            // Extract buttons
            document.querySelectorAll('button, input[type="button"], a.btn').forEach(el => {
                elements.push({
                    type: 'button',
                    text: el.innerText || el.value,
                    id: el.id,
                    class: el.className,
                    href: el.href
                });
            });
            // Extract forms
            document.querySelectorAll('form').forEach(form => {
                const formData = {
                    type: 'form',
                    id: form.id,
                    class: form.className,
                    action: form.action,
                    method: form.method,
                    fields: []
                };
                form.querySelectorAll('input, select, textarea').forEach(field => {
                    formData.fields.push({
                        type: field.type || field.tagName.toLowerCase(),
                        name: field.name,
                        id: field.id,
                        class: field.className
                    });
                });
                elements.push(formData);
            });
            // Extract modals/popups
            document.querySelectorAll('.modal, .popup, [class*="modal"], [class*="popup"]').forEach(el => {
                elements.push({
                    type: 'modal',
                    id: el.id,
                    class: el.className,
                    content: el.innerHTML
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

async function simulateAndSaveJsonResponses(page, url) {
    try {
        logger.debug(`Simulating JSON responses for ${url}`);
        const jsonResponses = await page.evaluate(() => {
            const responses = [];
            // Simulate API calls
            const apiEndpoints = [
                '/api/users',
                '/api/products',
                '/api/orders'
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
                            { id: 3, name: 'Item 3' }
                        ]
                    }
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

async function getIpAddress() {
    try {
        const response = await axios.get('https://api.ipify.org?format=json');
        return response.data.ip;
    } catch (error) {
        logger.error(`Error getting IP address: ${error.message}`);
        return 'Unknown';
    }
}