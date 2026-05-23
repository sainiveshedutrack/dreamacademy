const express = require('express');
const router  = express.Router();
const auth          = require('../middleware/auth');
const superadminAuth = require('../middleware/superadminAuth');
const {
  getAllTeachers,
  createTeacher,
  updateTeacher,
  deleteTeacher,
} = require('../controllers/adminController');

// All routes require auth + superadmin
router.use(auth, superadminAuth);

router.get('/teachers', getAllTeachers);
router.post('/teachers', createTeacher);
router.put('/teachers/:id', updateTeacher);
router.delete('/teachers/:id', deleteTeacher);

module.exports = router;
