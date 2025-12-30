const express = require("express");
const router = express.Router();
const { authenticate, authorizeRoles } = require("../middleware/auth");
const controller = require("../controllers/reportOwnerController");

// GET real-time owner report (owner only)
router.get("/", authenticate, authorizeRoles("owner"), controller.getOwnerReport);

// POST save owner report (owner only)
router.post("/", authenticate, authorizeRoles("owner"), controller.saveOwnerReport);

// GET list of saved reports (owner only)
router.get("/saved", authenticate, authorizeRoles("owner"), controller.getSavedReports);

// GET detail saved report by ID (owner only)
router.get("/saved/:id", authenticate, authorizeRoles("owner"), controller.getReportById);

module.exports = router;