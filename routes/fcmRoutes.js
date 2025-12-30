const express = require("express");
const router = express.Router();
const { registerToken, unregisterToken } = require("../controllers/fcmController");
const { authenticate } = require("../middleware/auth");

// Register FCM token
router.post("/register", authenticate, registerToken);

// Unregister FCM token
router.delete("/unregister", authenticate, unregisterToken);

module.exports = router;
