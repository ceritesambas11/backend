const express = require("express");
const router = express.Router();
const { authenticate, authorizeRoles } = require("../middleware/auth");
const controller = require("../controllers/reportDailyController");

// GET real-time daily report (owner+admin)
router.get("/", authenticate, authorizeRoles("owner","admin"), controller.getDailyReport);

// POST save daily report (owner+admin)
router.post("/", authenticate, authorizeRoles("owner","admin"), controller.saveDailyReport);

module.exports = router;
