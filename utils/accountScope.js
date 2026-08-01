const getLinkedUserIds = async (db, user) => {
  const ids = new Set();

  if (user?.id !== undefined && user?.id !== null) {
    ids.add(Number(user.id));
  }

  if (user?.phone) {
    const [rows] = await db.query(
      'SELECT id FROM users WHERE phone = ? AND id != ?',
      [user.phone, user.id]
    );

    rows.forEach((row) => {
      if (row?.id !== undefined && row?.id !== null) {
        ids.add(Number(row.id));
      }
    });
  }

  return [...ids];
};

module.exports = { getLinkedUserIds };