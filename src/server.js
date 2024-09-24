const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const config = require('./config/default');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const fs = require('fs').promises;
const { promisify } = require('util');
const exec = promisify(require('child_process').exec);
const crawlerService = require('./services/crawlerService');
const browserService = require('./services/browserService');
const logger = require('./utils/logger');
const archiver = require('archiver');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});
app.use(limiter);

const upload = multer({ dest: 'uploads/' });

let crawlProcess = null;

app.post('/crawl', upload.single('browserProfile'), async (req, res) => {
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
      browserProfilePath = path.join(__dirname, 'uploads', originalname);
      await fs.rename(tempPath, browserProfilePath);
    }

    res.json({ message: 'Tarama başlatıldı.' });

    const options = {
      maxDepth: parseInt(maxDepth) || config.crawler.maxDepth,
      maxPages: parseInt(maxPages) || config.crawler.maxPages,
      socketIo: io,
      browserProfilePath: browserProfilePath,
      waitTime: config.crawler.waitTime,
      twoCaptchaKey: twoCaptchaKey
    };

    if (useLogin === 'true' && username && password && loginUrl) {
      options.login = { username, password, loginUrl };
    }

    if (useProxy === 'true') {
      options.proxy = {
        host: proxyHost || config.proxy.host,
        port: proxyPort || config.proxy.port,
        username: proxyUsername || config.proxy.username,
        password: proxyPassword || config.proxy.password
      };

      // Proxy doğrulama
      const proxyIp = await browserService.verifyProxyUsage(options.proxy);
      if (proxyIp) {
        io.emit('proxy_verified', { ip: proxyIp });
      } else {
        io.emit('proxy_verification_failed');
      }
    }

    try {
      logger.info(`URL için tarama başlatılıyor: ${url}`);
      crawlProcess = crawlerService.crawlWebsite(url, options);
      await crawlProcess;
    } catch (error) {
      logger.error('Tarama sırasında hata oluştu:', error);
      io.emit('crawl_error', { message: 'Tarama sırasında bir hata oluştu.' });
    } finally {
      if (req.file) {
        await fs.unlink(browserProfilePath);
      }
      crawlProcess = null;
    }
  } catch (error) {
    logger.error('Tarama başlatılırken hata oluştu:', error);
    res.status(500).json({ error: 'Sunucu hatası.' });
  }
});

app.post('/stop', (req, res) => {
  if (crawlProcess) {
    crawlProcess.stop();
    res.json({ message: 'Tarama durduruldu.' });
  } else {
    res.status(400).json({ error: 'Aktif bir tarama işlemi yok.' });
  }
});

app.get('/download', (req, res) => {
  const downloadPath = path.join(__dirname, 'downloads');
  const zipPath = path.join(__dirname, 'crawled_website.zip');

  const output = fs.createWriteStream(zipPath);
  const archive = archiver('zip', { zlib: { level: 9 } });

  output.on('close', function () {
    res.download(zipPath, 'crawled_website.zip', (err) => {
      if (err) {
        logger.error('İndirme sırasında hata oluştu:', err);
      }
      fs.unlink(zipPath).catch((unlinkErr) => {
        logger.error('Zip dosyası silinirken hata oluştu:', unlinkErr);
      });
    });
  });

  archive.on('error', function (err) {
    res.status(500).send({ error: err.message });
  });

  archive.pipe(output);
  archive.directory(downloadPath, false);
  archive.finalize();
});

const port = config.server.port;
server.listen(port, () => {
  console.log(`Sunucu ${port} portunda çalışıyor.`);
});

function isValidUrl(string) {
  try {
    new URL(string);
    return true;
  } catch (_) {
    return false;
  }
}