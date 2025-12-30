// routes/ordersRoutes.js
const express = require('express');
const router = express.Router();
const { authenticate, authorizeRoles } = require('../middleware/auth');
const ordersController = require('../controllers/ordersController');

// Get dashboard stats (LETAKKAN DI ATAS ROUTE /:id)
router.get(
  '/dashboard/stats',
  authenticate,
  authorizeRoles('owner', 'admin'),
  ordersController.getDashboardStats
);

// Create new order
router.post(
  '/',
  authenticate,
  authorizeRoles('owner', 'admin'),
  ordersController.createOrder
);

// Get all orders
router.get(
  '/',
  authenticate,
  authorizeRoles('owner', 'admin'),
  ordersController.listOrders
);

// Get order timeline (HARUS DI ATAS /:id)
router.get(
  '/:id/timeline',
  authenticate,
  authorizeRoles('owner', 'admin'),
  ordersController.getOrderTimeline
);

// Get order by ID
router.get(
  '/:id',
  authenticate,
  authorizeRoles('owner', 'admin'),
  ordersController.getOrderById
);

// Update order
router.put(
  '/:id',
  authenticate,
  authorizeRoles('owner', 'admin'),
  ordersController.updateOrder
);

module.exports = router;