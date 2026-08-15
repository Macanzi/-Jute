// ============================================================
//  database/init-db.js — Standalone database initializer
//  Run with: node database/init-db.js
// ============================================================

require('dotenv').config();
const db = require('./database');

async function main() {
  console.log('\n🔧 Initializing PostgreSQL database...\n');
  console.log(`   DATABASE_URL: ${process.env.DATABASE_URL ? '✅ Set' : '❌ Not set'}\n`);

  try {
    await db.initSchema();
    console.log('\n✅ All tables created successfully!');
    console.log('   Tables: users, transactions, games, deposits, withdrawals, admin_actions, transfers');
    console.log('\n   You can now start the server with: npm start\n');
    process.exit(0);
  } catch (e) {
    console.error('\n❌ Database initialization failed:', e.message);
    console.error('\n   Make sure PostgreSQL is running and DATABASE_URL is correct.');
    console.error('   Example: postgres://user:password@localhost:5432/lucky_card\n');
    process.exit(1);
  }
}

main();
