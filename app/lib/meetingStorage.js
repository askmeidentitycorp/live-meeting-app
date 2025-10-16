import { MongoClient, ObjectId } from 'mongodb';

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const dbName = process.env.MONGODB_DB || 'liveMeetingApp';
const collectionName = 'meetings';
let cachedClient = null;
let cachedDb = null;

async function connectToDb() {
  if (cachedDb) return cachedDb;
  if (!cachedClient) {
    cachedClient = new MongoClient(uri);
    await cachedClient.connect();
  }
  cachedDb = cachedClient.db(dbName);
  return cachedDb;
}

export async function addMeeting(meetingId, meetingData) {
  const db = await connectToDb();
  await db.collection(collectionName).updateOne(
    { meetingId },
    { $set: { ...meetingData, meetingId } },
    { upsert: true }
  );
}

export async function removeMeeting(meetingId) {
  const db = await connectToDb();
  await db.collection(collectionName).deleteOne({ meetingId });
}

export async function getAllMeetings() {
  const db = await connectToDb();
  const meetings = await db.collection(collectionName).find({}).toArray();
  // Return as an object keyed by meetingId for compatibility
  return meetings.reduce((acc, m) => {
    acc[m.meetingId] = m;
    return acc;
  }, {});
}

export async function getMeeting(meetingId) {
  const db = await connectToDb();
  return await db.collection(collectionName).findOne({ meetingId });
}

export async function isUserHost(meetingId, userEmail) {
  const meeting = await getMeeting(meetingId);
  return meeting?.host?.email === userEmail;
}

export async function getMeetingsByHost(hostEmail) {
  const db = await connectToDb();
  return await db.collection(collectionName).find({ 'host.email': hostEmail }).toArray();
}

export async function updateMeetingHost(meetingId, hostData) {
  const db = await connectToDb();
  await db.collection(collectionName).updateOne(
    { meetingId },
    { $set: { 'host': hostData } }
  );
}

export async function updateMeetingRecording(meetingId, recordingData) {
  const db = await connectToDb();
  await db.collection(collectionName).updateOne(
    { meetingId },
    { $set: { 'host.recording': recordingData } }
  );
}
