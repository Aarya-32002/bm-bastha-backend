const assert = require('assert');
const { getLinkedUserIds } = require('../utils/accountScope');

(async () => {
  const db = {
    query: async (sql, params) => {
      if (sql.includes('SELECT id FROM users')) {
        return [[{ id: 6 }, { id: 9 }]];
      }
      return [[]];
    },
  };

  const ids = await getLinkedUserIds(db, { id: 6, phone: '9182443181' });
  assert.deepStrictEqual(ids, [6, 9]);
  console.log('orderController test passed');
})();
