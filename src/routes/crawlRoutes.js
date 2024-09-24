const express = require('express');
const multer = require('multer');
const crawlController = require('../controllers/crawlController');

const router = express.Router();
const upload = multer({ dest: 'uploads/' });

router.post('/', upload.single('browserProfile'), crawlController.startCrawl);

module.exports = router;