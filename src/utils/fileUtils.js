const path = require('path');
const fs = require('fs').promises;

exports.shortenFileName = (fileName) => {
    const maxLength = 255; // Maximum file name length for most file systems
    if (fileName.length <= maxLength) {
        return fileName;
    }

    const ext = path.extname(fileName);
    const name = path.basename(fileName, ext);
    const shortened = name.substring(0, maxLength - ext.length - 1);
    return `${shortened}${ext}`;
};

exports.createDirectoryIfNotExists = async (dirPath) => {
    try {
        await fs.access(dirPath);
    } catch (error) {
        if (error.code === 'ENOENT') {
            await fs.mkdir(dirPath, { recursive: true });
        } else {
            throw error;
        }
    }
};

exports.saveJsonToFile = async (filePath, data) => {
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
};

exports.readJsonFromFile = async (filePath) => {
    const content = await fs.readFile(filePath, 'utf8');
    return JSON.parse(content);
};