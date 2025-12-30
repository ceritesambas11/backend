// routes/orderItemRoutes.js
const express = require("express");
const router = express.Router();
const { authenticate, authorizeRoles } = require("../middleware/auth");
const { updateItemStatus } = require("../controllers/orderItemController");

// Semua route butuh login
router.use(authenticate);
router.use(authorizeRoles("admin", "owner"));

// Update status item
router.put("/:id/status", updateItemStatus);

module.exports = router;
