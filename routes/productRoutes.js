//backend/routes/productRoutes.js//
const express = require('express');
const router = express.Router();
const {
  getAllProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  getRecipeByProduct,
  saveRecipe,
  getRawMaterials,
  addStock,
  reduceStock,
  getStockHistory,
} = require('../controllers/productsController');

// ===== ROUTES =====
router.get('/', getAllProducts);
router.post('/', createProduct);
router.put('/:id', updateProduct);
router.delete('/:id', deleteProduct);
router.get('/raw-materials', getRawMaterials);

// Resep
router.get('/recipe/:product_id', getRecipeByProduct);
router.post('/recipe', saveRecipe);

// Stock Management
router.post('/:id/stock/add', addStock);
router.post('/:id/stock/reduce', reduceStock);
router.get('/:id/stock/history', getStockHistory);

module.exports = router;