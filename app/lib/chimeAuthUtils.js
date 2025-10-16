/**
 * Utility functions for AWS Chime authentication integration
 */

/**
 * Parse ExternalUserId to extract user information
 * @param {string} externalUserId - The ExternalUserId from Chime attendee
 * @returns {Object} Parsed user information
 */
export function parseExternalUserId(externalUserId) {
  if (!externalUserId) {
    return { type: 'unknown', name: 'Unknown', userId: null };
  }

  const parts = externalUserId.split('|');
  
  if (parts.length >= 2) {
    return {
      type: parts[0].toLowerCase(), // 'host', 'user', or 'guest'
      userId: parts[1], // email or name
      timestamp: parts[2] || null,
      random: parts[3] || null,
      isHost: parts[0] === 'HOST',
      isAuthenticated: parts[0] === 'HOST' || parts[0] === 'USER',
      isGuest: parts[0] === 'GUEST'
    };
  }

  // Fallback for old format
  return {
    type: 'legacy',
    userId: externalUserId,
    isHost: false,
    isAuthenticated: false,
    isGuest: true
  };
}

/**
 * Create a structured ExternalUserId
 * @param {string} userType - 'HOST', 'USER', or 'GUEST'
 * @param {string} identifier - User email or name
 * @returns {string} Formatted ExternalUserId
 */
export function createExternalUserId(userType, identifier) {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substr(2, 9);
  return `${userType}|${identifier}|${timestamp}|${random}`;
}

/**
 * Check if a user has host privileges
 * @param {Object} attendee - Chime attendee object
 * @returns {boolean} True if user is a host
 */
export function isHostAttendee(attendee) {
  if (!attendee?.ExternalUserId) return false;
  const parsed = parseExternalUserId(attendee.ExternalUserId);
  return parsed.isHost;
}

/**
 * Get display name from ExternalUserId
 * @param {string} externalUserId - The ExternalUserId from Chime attendee
 * @returns {string} Display name
 */
export function getDisplayName(externalUserId) {
  const parsed = parseExternalUserId(externalUserId);
  
  if (parsed.userId?.includes('@')) {
    // Extract name from email
    return parsed.userId.split('@')[0];
  }
  
  return parsed.userId || 'Unknown';
}

/**
 * Validate if user session matches host email
 * @param {Object} session - NextAuth session object
 * @param {Object} meetingData - Meeting data with host info
 * @returns {boolean} True if user is the host
 */
export function isUserMeetingHost(session, meetingData) {
  if (!session?.user?.email || !meetingData?.host?.email) {
    return false;
  }
  return session.user.email === meetingData.host.email;
}

/**
 * Format host information for display
 * @param {Object} hostInfo - Host information object
 * @returns {string} Formatted host display string
 */
export function formatHostInfo(hostInfo) {
  if (!hostInfo) return 'Unknown Host';
  
  const name = hostInfo.name || hostInfo.email || 'Unknown';
  const provider = hostInfo.provider ? ` (via ${hostInfo.provider})` : '';
  
  return `${name}${provider}`;
}

/**
 * Check if user can perform host-only actions
 * @param {Object} session - NextAuth session object
 * @param {Object} meetingData - Meeting data with host info
 * @param {string} attendeeExternalUserId - Current attendee's ExternalUserId
 * @returns {boolean} True if user has host privileges
 */
export function canPerformHostActions(session, meetingData, attendeeExternalUserId) {
  // Check if marked as host in meeting data
  const isOriginalHost = isUserMeetingHost(session, meetingData);
  
  // Check if current attendee connection is marked as host
  const isHostConnection = attendeeExternalUserId?.startsWith('HOST|');
  
  return isOriginalHost || isHostConnection;
}

/**
 * Get user badge/label based on user type
 * @param {string} externalUserId - The ExternalUserId from Chime attendee
 * @returns {Object} Badge information
 */
export function getUserBadge(externalUserId) {
  const parsed = parseExternalUserId(externalUserId);
  
  if (parsed.isHost) {
    return {
      label: 'Host',
      color: 'blue',
      icon: '👑'
    };
  }
  
  if (parsed.isAuthenticated) {
    return {
      label: 'Member',
      color: 'green',
      icon: '✓'
    };
  }
  
  return {
    label: 'Guest',
    color: 'gray',
    icon: '👤'
  };
}

/**
 * Filter attendees by type
 * @param {Array} attendees - Array of Chime attendees
 * @param {string} type - 'host', 'user', or 'guest'
 * @returns {Array} Filtered attendees
 */
export function filterAttendeesByType(attendees, type) {
  if (!Array.isArray(attendees)) return [];
  
  return attendees.filter(attendee => {
    const parsed = parseExternalUserId(attendee.ExternalUserId);
    return parsed.type === type.toLowerCase();
  });
}

/**
 * Get statistics about meeting attendees
 * @param {Array} attendees - Array of Chime attendees
 * @returns {Object} Statistics object
 */
export function getAttendeeStats(attendees) {
  if (!Array.isArray(attendees)) {
    return { total: 0, hosts: 0, authenticated: 0, guests: 0 };
  }
  
  const stats = {
    total: attendees.length,
    hosts: 0,
    authenticated: 0,
    guests: 0
  };
  
  attendees.forEach(attendee => {
    const parsed = parseExternalUserId(attendee.ExternalUserId);
    if (parsed.isHost) stats.hosts++;
    else if (parsed.isAuthenticated) stats.authenticated++;
    else if (parsed.isGuest) stats.guests++;
  });
  
  return stats;
}
