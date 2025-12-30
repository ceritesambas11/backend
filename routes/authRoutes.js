const express = require('express');
const router = express.Router();
const { login, register, getProfile, updateProfile } = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');

// Tambahkan middleware upload
const upload = require('../middleware/upload');
const { uploadAvatar } = require('../controllers/authController');

// Public routes
router.post('/login', login);
router.post('/register', register);

// Protected routes
router.get('/profile', authenticate, getProfile);
router.put('/profile', authenticate, updateProfile);

// Upload foto profil
router.post('/upload-avatar', authenticate, upload.single('avatar'), uploadAvatar);

module.exports = router;
