
const cheerio = require('cheerio');
const fs = require('fs').promises;
const path = require('path');
const { createHash } = require('crypto');
const { shortenFileName } = require('../utils/fileUtils');
const logger = require('../utils/logger');

exports.savePage = async (url, content, resources) => {
    const parsedUrl = new URL(url);
    const domain = parsedUrl.hostname;
    let pathname = parsedUrl.pathname;
    
    const urlHash = createHash('md5').update(url).digest('hex').substring(0, 8);
    
    const parts = pathname.split('/');
    parts[parts.length - 1] = shortenFileName(parts[parts.length - 1]);
    pathname = parts.join('/');
    
    const dirPath = path.join('downloads', domain, path.dirname(pathname));
    await fs.mkdir(dirPath, { recursive: true });
    
    let fileName = `${urlHash}_${path.basename(pathname) || 'index.html'}`;
    if (!path.extname(fileName)) {
        fileName += '.html';
    }
    
    const filePath = path.join(dirPath, fileName);
    
    const $ = cheerio.load(content);
    
    // Update resource URLs to absolute URLs
    $('a, link, script, img').each((i, elem) => {
        const attr = $(elem).attr('href') ? 'href' : 'src';
        const oldUrl = $(elem).attr(attr);
        if (oldUrl && !oldUrl.startsWith('http') && !oldUrl.startsWith('//')) {
            const absoluteUrl = new URL(oldUrl, url).href;
            $(elem).attr(attr, absoluteUrl);
        }
    });
    
    await fs.writeFile(filePath, $.html());
    logger.info(`Saved: ${url} to ${filePath}`);

    // Download and save additional resources (CSS, images, etc.)
    for (const resource of resources) {
        try {
            const resourceUrl = new URL(resource.url);
            const resourcePath = resourceUrl.pathname;
            const resourceHash = createHash('md5').update(resource.url).digest('hex').substring(0, 8);
            const resourceFileName = `${resourceHash}_${path.basename(resourcePath)}`;
            const resourceFilePath = path.join(dirPath, resourceFileName);
            
            await fs.mkdir(path.dirname(resourceFilePath), { recursive: true });
            const response = await fetch(resource.url);
            const buffer = await response.arrayBuffer();
            await fs.writeFile(resourceFilePath, Buffer.from(buffer));
            logger.info(`Saved resource: ${resource.url} to ${resourceFilePath}`);
        } catch (error) {
            logger.error(`Error saving resource ${resource.url}: ${error.message}`);
        }
    }
};

exports.saveJavaScriptFiles = async (url, jsFiles) => {
    const parsedUrl = new URL(url);
    const domain = parsedUrl.hostname;
    const urlHash = createHash('md5').update(url).digest('hex').substring(0, 8);

    const dirPath = path.join('downloads', domain, 'js');
    await fs.mkdir(dirPath, { recursive: true });

    for (const jsFile of jsFiles) {
        try {
            const jsUrl = new URL(jsFile, url);
            const jsPath = jsUrl.pathname;
            const jsHash = createHash('md5').update(jsFile).digest('hex').substring(0, 8);
            const jsFileName = `${jsHash}_${path.basename(jsPath)}`;
            const jsFilePath = path.join(dirPath, jsFileName);
            
            const response = await fetch(jsUrl.href);
            const buffer = await response.arrayBuffer();
            await fs.writeFile(jsFilePath, Buffer.from(buffer));
            logger.info(`Saved JS file: ${jsFile} to ${jsFilePath}`);
        } catch (error) {
            logger.error(`Error saving JS file ${jsFile}: ${error.message}`);
        }
    }
};

exports.saveInteractiveElements = async (url, elements) => {
    const parsedUrl = new URL(url);
    const domain = parsedUrl.hostname;
    const urlHash = createHash('md5').update(url).digest('hex').substring(0, 8);
    
    const dirPath = path.join('downloads', domain, 'interactive_elements');
    await fs.mkdir(dirPath, { recursive: true });
    
    const filePath = path.join(dirPath, `${urlHash}_interactive_elements.json`);
    
    await fs.writeFile(filePath, JSON.stringify(elements, null, 2));
    logger.info(`Saved interactive elements for ${url} to ${filePath}`);
};

exports.saveJsonResponse = async (pageUrl, apiUrl, data) => {
    const parsedUrl = new URL(pageUrl);
    const domain = parsedUrl.hostname;
    const urlHash = createHash('md5').update(apiUrl).digest('hex').substring(0, 8);
    
    const dirPath = path.join('downloads', domain, 'api_responses');
    await fs.mkdir(dirPath, { recursive: true });
    
    const fileName = `${urlHash}_api_response.json`;
    const filePath = path.join(dirPath, fileName);
    
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
    logger.info(`Saved API response for ${apiUrl} to ${filePath}`);
};
