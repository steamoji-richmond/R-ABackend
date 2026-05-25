import { connectDb, disconnectDb } from './db.js'
import Member from './models/Member.js'
import PendingMember from './models/PendingMember.js'
import Session from './models/Session.js'
import Registration from './models/Registration.js'
import { nanoid } from 'nanoid'

function dayAt(daysFromNow, hour, minute = 0) {
  const d = new Date()
  d.setDate(d.getDate() + daysFromNow)
  d.setHours(hour, minute, 0, 0)
  return d
}

async function run() {
  await connectDb()
  console.log('[seed] clearing collections…')
  await Promise.all([
    Member.deleteMany({}),
    PendingMember.deleteMany({}),
    Session.deleteMany({}),
    Registration.deleteMany({}),
  ])

  console.log('[seed] inserting approved members…')
  const members = await Member.insertMany([
    {
      badgeId: 'B1001',
      firstName: 'Ava',
      lastName: 'Chen',
      familyRole: 'Child',
      age: '9',
      house: 'Red',
      level: '3',
      school: 'Maple Elementary',
      parent: 'Linda Chen',
      parentEmail: 'linda.chen@example.com',
      phoneNumber: '+1-415-555-0101',
      membershipType: 'yearly',
    },
    {
      badgeId: 'B1002',
      firstName: 'Noah',
      lastName: 'Patel',
      familyRole: 'Child',
      age: '10',
      house: 'Blue',
      level: '4',
      school: 'Oak Middle',
      parent: 'Sanjay Patel',
      parentEmail: 'sanjay.patel@example.com',
      phoneNumber: '+1-415-555-0182',
      membershipType: 'semi-yearly',
    },
    {
      badgeId: 'B1003',
      firstName: 'Zoey',
      lastName: 'Smith',
      familyRole: 'Child',
      age: '8',
      house: 'Yellow',
      level: '2',
      school: 'Maple Elementary',
      parent: 'Kate Smith',
      parentEmail: 'kate.smith@example.com',
      phoneNumber: '+1-415-555-0267',
      membershipType: 'none',
    },
  ])

  console.log('[seed] inserting pending sign-ups…')
  const pendingMembers = await PendingMember.insertMany([
    {
      firstName: 'Liam',
      lastName: 'Garcia',
      familyRole: 'Child',
      age: '11',
      school: 'Pine Middle',
      parent: 'Maria Garcia',
      parentEmail: 'maria.garcia@example.com',
      phoneNumber: '+1-415-555-0334',
      membershipType: 'none',
      status: 'pending',
    },
  ])

  console.log('[seed] inserting sessions…')
  const sessionsToInsert = [
    {
      id: 'S' + nanoid(9),
      dt: dayAt(3, 10).toISOString(),
      topic: 'Public Speaking — Intro',
      capacity: 10,
      price: 20,
      currency: 'USD',
      reg: [],
      att: [],
    },
    {
      id: 'S' + nanoid(9),
      dt: dayAt(3, 13).toISOString(),
      topic: 'Public Speaking — Storytelling',
      capacity: 8,
      price: 25,
      currency: 'USD',
      reg: [],
      att: [],
    },
    {
      id: 'S' + nanoid(9),
      dt: dayAt(10, 10).toISOString(),
      topic: 'Public Speaking — Free Community Day',
      capacity: 15,
      price: 0,
      currency: 'USD',
      reg: [],
      att: [],
    },
  ]
  const sessions = await Session.insertMany(
    sessionsToInsert.map((s) => ({ ...s, dt: new Date(s.dt) }))
  )

  console.log('[seed] inserting sample registrations…')
  // NOTE: registrations only reference approved Members. Pending sign-ups
  // (like the one above) intentionally cannot be registered for a session
  // until an admin approves them on the Approvals page.
  const freeSession = sessions[2]
  const paidSession = sessions[0]

  const r1 = await Registration.create({
    id: 'REG' + nanoid(10).toUpperCase(),
    memberId: members[0]._id,
    sessionId: freeSession.id,
    sessionDate: freeSession.dt.toISOString().slice(0, 10),
    sessionTime: freeSession.dt.toTimeString().slice(0, 5),
    sessionTopic: freeSession.topic,
    registeredBy: 'admin',
    registeredDateAndTime: new Date(),
    priceAmount: 0,
    currency: 'USD',
    membershipType: 'yearly',
    paymentStatus: 'not_required',
  })
  const r2 = await Registration.create({
    id: 'REG' + nanoid(10).toUpperCase(),
    memberId: members[1]._id,
    sessionId: paidSession.id,
    sessionDate: paidSession.dt.toISOString().slice(0, 10),
    sessionTime: paidSession.dt.toTimeString().slice(0, 5),
    sessionTopic: paidSession.topic,
    registeredBy: 'admin',
    registeredDateAndTime: new Date(),
    priceAmount: paidSession.price / 2,
    currency: 'USD',
    membershipType: 'semi-yearly',
    paymentStatus: 'pending',
  })
  const r3 = await Registration.create({
    id: 'REG' + nanoid(10).toUpperCase(),
    memberId: members[2]._id,
    sessionId: paidSession.id,
    sessionDate: paidSession.dt.toISOString().slice(0, 10),
    sessionTime: paidSession.dt.toTimeString().slice(0, 5),
    sessionTopic: paidSession.topic,
    registeredBy: 'admin',
    registeredDateAndTime: new Date(),
    priceAmount: paidSession.price,
    currency: 'USD',
    membershipType: 'none',
    paymentStatus: 'pending',
  })

  await Session.updateOne({ id: freeSession.id }, { $addToSet: { reg: r1.id } })
  await Session.updateOne({ id: paidSession.id }, { $addToSet: { reg: { $each: [r2.id, r3.id] } } })

  console.log('[seed] done.')
  console.log(`   ${members.length} approved members`)
  console.log(`   ${pendingMembers.length} pending sign-ups`)
  console.log(`   ${sessions.length} sessions`)
  console.log('   3 sample registrations')
  await disconnectDb()
}

run().catch((err) => {
  console.error('[seed] failed', err)
  process.exit(1)
})
