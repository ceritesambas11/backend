// routes/productforcostumerRoutes.js
const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const productController = require("../controllers/productForCustomerController");
const { authenticate, authorizeRoles } = require("../middleware/auth");

// Multer config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, "../uploads/products");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + "-" + Math.round(Math.random() * 1e9) + path.extname(file.originalname);
    cb(null, uniqueName);
  },
});
const upload = multer({ storage });

// ====================================================
// PUBLIC ROUTES
// ====================================================
router.get("/list", productController.getAllProducts);

// ====================================================
// PROTECTED ROUTES (owner/admin)
// ====================================================
router.get("/:id", authenticate, productController.getProductById);

// Create product (with image upload)
router.post(
  "/",
  authenticate,
  authorizeRoles("owner", "admin"),
  upload.array("images", 20),
  productController.createProduct
);

// Update product (with image upload)
router.put(
  "/:id",
  authenticate,
  authorizeRoles("owner", "admin"),
  upload.array("images", 20),
  productController.updateProduct
);

// Delete product
router.delete(
  "/:id",
  authenticate,
  authorizeRoles("owner", "admin"),
  productController.deleteProduct
);

// Delete single image from product
router.delete(
  "/:productId/image/:imageIndex",
  authenticate,
  authorizeRoles("owner", "admin"),
  productController.deleteImageById
);

module.exports = router;