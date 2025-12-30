const express = require('express');
const router = express.Router();
const { authenticate, authorizeRoles } = require('../middleware/auth');
const userController = require('../controllers/userController');

console.log("? userRoutes loaded");

// ? Route publik untuk dropdown karyawan
router.get('/public/list', userController.getAllUsers);

// ?? Route aman (memerlukan login)
router.get('/', authenticate, userController.getAllUsers);
router.get('/:id', authenticate, userController.getUserById);
router.post('/', authenticate, authorizeRoles('owner', 'admin'), userController.createUser);
router.put('/:id', authenticate, authorizeRoles('owner', 'admin'), userController.updateUser);
router.delete('/:id', authenticate, authorizeRoles('owner'), userController.deleteUser);

module.exports = router;
