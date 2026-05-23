/**
 * Super Admin authorization middleware.
 * Must be used AFTER the auth middleware.
 * Checks req.teacher.role === 'superadmin'.
 */
const superadminAuth = (req, res, next) => {
  if (!req.teacher || req.teacher.role !== 'superadmin') {
    return res.status(403).json({ error: 'Access denied. Super Admin privileges required.' });
  }
  next();
};

module.exports = superadminAuth;
