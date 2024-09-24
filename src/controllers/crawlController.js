const path = require('path');
const fs = require('fs').promises;
const { promisify } = require('util');
const exec = promisify(require('child_process').exec);
const crawlerService = require('../services/crawlerService');
const browserService = require('../services/browserService');
const logger = require('../utils/logger');

exports.startCrawl = async (req, res) => {
  try {
    const {
      url,
      maxDepth,
      maxPages,
      useLogin,
      username,
      password,
      loginUrl,
      useProxy,
      proxyHost,
      proxyPort,
      proxyUsername,
      proxyPassword,
      twoCaptchaKey
    } = req.body;

    if (!url || !isValidUrl(url)) {
      return res.status(400).json({ error: 'Geçerli bir URL gereklidir.' });
    }

    let browserProfilePath = null;

    if (req.file) {
      const { path: tempPath, originalname } = req.file;
      const targetPath = path.join(__dirname, '..', '..', 'uploads', originalname);

      try {
        await fs.rename(tempPath, targetPath);
        browserProfilePath = targetPath;

        const extractPath = path.join(__dirname, '..', '..', 'browser_profile');
        await exec(`mkdir -p ${extractPath} && tar -xzf ${browserProfilePath} -C ${extractPath}`);

        const isValid = await browserService.validateBrowserProfile(extractPath);
        if (!isValid) {
          throw new Error('Geçersiz tarayıcı profili.');
        }

        req.app.io.emit('profile_validation', { success: true });
      } catch (error) {
        logger.error('Tarayıcı profili işlenirken hata oluştu:', error);
        req.app.io.emit('profile_validation', { success: false, message: error.message });
        return res.status(400).json({ error: 'Tarayıcı profili işlenirken hata oluştu.' });
      }
    } else {
      browserProfilePath = path.join(__dirname, '..', '..', 'default_browser_profile');
    }

    res.json({ message: 'Tarama başlatıldı.' });

    const options = {
      maxDepth: parseInt(maxDepth) || 3,
      maxPages: parseInt(maxPages) || 100,
      socketIo: req.app.io,
      browserProfilePath: browserProfilePath,
      waitTime: 5000,
      twoCaptchaKey: twoCaptchaKey
    };

    if (useLogin === 'true' && username && password && loginUrl) {
      options.login = { username, password, loginUrl };
    }

    if (useProxy === 'true') {
      options.proxy = { host: proxyHost, port: proxyPort, username: proxyUsername, password: proxyPassword };
    }

    try {
      await crawlerService.crawlWebsite(url, options);
    } catch (error) {
      logger.error('Tarama sırasında hata oluştu:', error);
      req.app.io.emit('crawl_error', { message: 'Tarama sırasında bir hata oluştu.' });
    } finally {
      if (req.file) {
        await exec(`rm -rf ${path.join(__dirname, '..', '..', 'browser_profile')}`);
        await fs.unlink(browserProfilePath);
      }
    }
  } catch (error) {
    logger.error('Tarama başlatılırken hata oluştu:', error);
    res.status(500).json({ error: 'Sunucu hatası.' });
  }
};

function isValidUrl(string) {
  try {
    new URL(string);
    return true;
  } catch (_) {
    return false;
  }
}