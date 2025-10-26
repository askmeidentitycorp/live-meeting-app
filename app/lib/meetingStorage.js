import { MongoClient, ObjectId } from 'mongodb';

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const dbName = process.env.MONGODB_DB || 'liveMeetingApp';
const collectionName = 'meetings';
let cachedClient = null;
let cachedDb = null;

async function connectToDb() {
  if (cachedDb && cachedClient) {
    try {
      await cachedClient.db('admin').command({ ping: 1 });
      return cachedDb;
    } catch (error) {
      console.log('[MeetingStorage] Connection lost, reconnecting...');
      cachedClient = null;
      cachedDb = null;
    }
  }
  
  if (!cachedClient) {
    console.log('[MeetingStorage] Creating new MongoDB connection...');
    cachedClient = new MongoClient(uri, {
      maxPoolSize: 10,
      minPoolSize: 2,
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
    });
    await cachedClient.connect();
    console.log('[MeetingStorage] MongoDB connected successfully');
  }
  
  cachedDb = cachedClient.db(dbName);
  return cachedDb;
}

export async function addMeeting(meetingId, meetingData) {
  const db = await connectToDb();
  const result = await db.collection(collectionName).updateOne(
    { meetingId },
    { $set: { ...meetingData, meetingId } },
    { upsert: true }
  );
  
  await new Promise(resolve => setTimeout(resolve, 100));
  
  const verification = await db.collection(collectionName).findOne({ meetingId });
  if (!verification) {
    console.error('[MeetingStorage] WARNING: Could not verify meeting was stored!');
  } else {
    console.log('[MeetingStorage] Verification: Meeting found after write');
  }
  
  return result;
}

export async function removeMeeting(meetingId) {
  const db = await connectToDb();
  await db.collection(collectionName).deleteOne({ meetingId });
}

export async function getAllMeetings() {
  const db = await connectToDb();
  const meetings = await db.collection(collectionName).find({}).toArray();
  return meetings.reduce((acc, m) => {
    acc[m.meetingId] = m;
    return acc;
  }, {});
}

export async function getMeeting(meetingId) {
  const db = await connectToDb();
  
  const maxRetries = 3;
  const retryDelay = 200; // ms
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const meeting = await db.collection(collectionName).findOne({ meetingId });
        
    if (meeting) {
      return meeting;
    }
    
    if (attempt < maxRetries) {
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }
    return null;
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
