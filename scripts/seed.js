require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../src/models/User');
const Request = require('../src/models/Request');
const generateRequestId = require('../src/utils/generateRequestId');

// Populates a database with enough data that pagination, filtering and search
// all visibly do something. Run with: npm run seed
// A reviewer can then see the API working in under a minute.

const CATEGORIES = ['Technical', 'Billing', 'Hardware', 'Network', 'General'];
const PRIORITIES = ['Low', 'Medium', 'High'];
const STATUSES = ['Pending', 'In Progress', 'Completed', 'Cancelled'];

const TITLES = [
  ['Login server returning 502', 'The authentication server has been returning 502 errors since the deploy this morning.'],
  ['Duplicate line on October invoice', 'The October invoice shows the same subscription line item twice.'],
  ['Laptop screen not turning on', 'The screen stays black although the power light is on.'],
  ['VPN drops every few minutes', 'The office VPN connection drops roughly every four minutes.'],
  ['Password reset email never arrives', 'Reset emails are not being delivered to outlook addresses.'],
  ['Printer on the second floor is offline', 'The shared printer does not appear on the network.'],
  ['Database backup job failed', 'The nightly backup job has failed three nights in a row.'],
  ['Refund not credited', 'A refund processed last week has still not appeared on the statement.'],
  ['Slow page load on the dashboard', 'The dashboard takes over eight seconds to render.'],
  ['New starter needs an account', 'Please create an account for the developer joining on Monday.'],
  ['SSL certificate expiring', 'The certificate for the staging domain expires in nine days.'],
  ['Wifi weak in meeting room 3', 'Signal drops to one bar in the far corner of the room.'],
];

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const daysAgo = (n) => new Date(Date.now() - n * 86400000);

const seed = async () => {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is not set');
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected.');

  await Promise.all([User.deleteMany({}), Request.deleteMany({})]);
  console.log('Cleared existing users and requests.');

  const admin = await User.create({
    name: 'Admin User', email: 'admin@example.com', password: 'Password123', role: 'admin',
  });
  const alice = await User.create({
    name: 'Alice Kumar', email: 'alice@example.com', password: 'Password123',
  });
  const bob = await User.create({
    name: 'Bob Singh', email: 'bob@example.com', password: 'Password123',
  });

  let created = 0;
  for (const owner of [alice, bob, admin]) {
    const count = owner === alice ? 14 : 8;
    for (let i = 0; i < count; i += 1) {
      const [title, description] = pick(TITLES);
      const doc = new Request({
        requestId: generateRequestId(),
        title,
        description,
        category: pick(CATEGORIES),
        priority: pick(PRIORITIES),
        status: pick(STATUSES),
        createdBy: owner._id,
        createdAt: daysAgo(Math.floor(Math.random() * 45)),
      });
      doc.$locals.changedBy = owner._id;
      await doc.save();
      created += 1;
    }
  }

  // One soft-deleted record so the restore endpoint has something to restore.
  const toDelete = await Request.findOne({ createdBy: alice._id });
  toDelete.isDeleted = true;
  toDelete.deletedAt = new Date();
  toDelete.deletedBy = alice._id;
  await toDelete.save();

  console.log(`
  Seeded 3 users and ${created} requests.

    admin@example.com / Password123   (role: admin)
    alice@example.com / Password123   (14 requests, 1 soft-deleted)
    bob@example.com   / Password123   (8 requests)

  Soft-deleted request available for restore: ${toDelete.requestId}
  `);

  await mongoose.connection.close();
};

seed().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
