const auth = require('../lib/auth');

// Who is signed in — the frontend uses it to show the signed-in user and the admin-only Users tab.
module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const user = await auth.authenticate(req.headers.authorization);
    if (!user) return res.status(401).json({ success: false, error: 'Not signed in' });
    return res.status(200).json({ success: true, username: user.username, isAdmin: user.isAdmin });
  } catch (error) {
    console.error('Auth check failed:', error.message);
    return res.status(503).json({ success: false, error: 'Authentication unavailable' });
  }
};
