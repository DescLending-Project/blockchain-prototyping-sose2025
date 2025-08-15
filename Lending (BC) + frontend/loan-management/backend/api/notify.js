const express = require('express');
const router = express.Router();

// Log proposal event
router.post('/log/proposal', (req, res) => {
    console.log('Proposal Event:', req.body);
    res.status(200).json({ status: 'ok' });
});

// Log vote event
router.post('/log/vote', (req, res) => {
    console.log('Vote Event:', req.body);
    res.status(200).json({ status: 'ok' });
});

// Log slash event
router.post('/log/slash', (req, res) => {
    console.log('Slash Event:', req.body);
    res.status(200).json({ status: 'ok' });
});

module.exports = router; 