const winston = require('winston');
const fs = require('fs').promises;
const path = require('path');

const logFormat = winston.format.printf(({ timestamp, level, message }) => {
  return `${timestamp} [${level.toUpperCase()}]: ${message}`;
});

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(winston.format.timestamp(), logFormat),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'crawler.log' })
  ]
});

async function appendToLogFile(message) {
  const logPath = path.join(__dirname, '..', '..', 'log.txt');
  await fs.appendFile(logPath, message + '\n');
}

module.exports = {
  debug: (message) => {
    logger.debug(message);
    appendToLogFile(`[DEBUG] ${message}`);
  },
  info: (message) => {
    logger.info(message);
    appendToLogFile(`[INFO] ${message}`);
  },
  error: (message, error) => {
    if (error && error.stack) {
      logger.error(`${message}\n${error.stack}`);
      appendToLogFile(`[ERROR] ${message}\n${error.stack}`);
    } else {
      logger.error(message);
      appendToLogFile(`[ERROR] ${message}`);
    }
  },
  warn: (message) => {
    logger.warn(message);
    appendToLogFile(`[WARN] ${message}`);
  }
};