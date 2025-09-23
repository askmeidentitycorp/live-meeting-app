// In-memory storage for tracking active meetings
let meetings = {};

export function addMeeting(meetingId, meetingData) {
  meetings[meetingId] = meetingData;
}

export function removeMeeting(meetingId) {
  delete meetings[meetingId];
}

export function getAllMeetings() {
  return meetings;
}

export function getMeeting(meetingId) {
  return meetings[meetingId];
}