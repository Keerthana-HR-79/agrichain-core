const pool = require("../config/db");

// GET all notifications for logged in user
const getNotifications = async (req, res) => {
  try {
    const user_id = req.user.id;

    const result = await pool.query(
      `SELECT * FROM notifications
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [user_id]
    );

    const unreadCount = result.rows.filter((n) => !n.is_read).length;

    res.status(200).json({
      success: true,
      notifications: result.rows,
      unread_count: unreadCount,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Error fetching notifications" });
  }
};

// MARK single notification as read
const markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    const user_id = req.user.id;

    await pool.query(
      `UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2`,
      [id, user_id]
    );

    res.status(200).json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Error marking notification" });
  }
};

// MARK ALL as read
const markAllRead = async (req, res) => {
  try {
    const user_id = req.user.id;

    await pool.query(
      `UPDATE notifications SET is_read = true WHERE user_id = $1`,
      [user_id]
    );

    res.status(200).json({ success: true, message: "All notifications marked as read" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

module.exports = { getNotifications, markAsRead, markAllRead };
