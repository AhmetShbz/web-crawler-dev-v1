const winston = require('winston');
const fs = require('fs').promises;
const path = require('path');
require('winston-daily-rotate-file');

const logFormat = winston.format.printf(({ timestamp, level, message, metadata }) => {
  return `${timestamp} [${level.toUpperCase()}]: ${message} ${metadata ? JSON.stringify(metadata) : ''}`;
});

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.metadata({ fillExcept: ['message', 'level', 'timestamp'] }),
    logFormat
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.DailyRotateFile({
      filename: 'logs/crawler-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '14d'
    })
  ]
});

async function appendToLogFile(message) {
  const logPath = path.join(__dirname, '..', '..', 'logs', 'detailed.log');
  await fs.appendFile(logPath, message + '\n');
}

function logWithMetadata(level, message, metadata) {
  logger.log(level, message, metadata);
  appendToLogFile(`[${level.toUpperCase()}] ${message} ${JSON.stringify(metadata)}`);
}

module.exports = {
  debug: (message, metadata) => logWithMetadata('debug', message, metadata),
  info: (message, metadata) => logWithMetadata('info', message, metadata),
  warn: (message, metadata) => logWithMetadata('warn', message, metadata),
  error: (message, error) => {
    if (error && error.stack) {
      logWithMetadata('error', message, { stack: error.stack });
    } else {
      logWithMetadata('error', message, error);
    }
  },
  fatal: (message, error) => {
    if (error && error.stack) {
      logWithMetadata('error', `FATAL: ${message}`, { stack: error.stack });
    } else {
      logWithMetadata('error', `FATAL: ${message}`, error);
    }
  }
};