// Utility functions to check and handle media device availability

export const checkMediaDeviceSupport = () => {
  if (typeof window === 'undefined') {
    return { supported: false, reason: 'Server-side rendering' };
  }
  
  if (!navigator.mediaDevices) {
    return { 
      supported: false, 
      reason: 'MediaDevices API not available. This usually means you need HTTPS or localhost.',
      suggestion: 'Try accessing via https:// or ensure you\'re on localhost'
    };
  }
  
  if (!navigator.mediaDevices.getUserMedia) {
    return { 
      supported: false, 
      reason: 'getUserMedia not available',
      suggestion: 'Your browser may not support media capture'
    };
  }
  
  return { supported: true };
};

export const getMediaPermissions = async () => {
  try {
    const check = checkMediaDeviceSupport();
    if (!check.supported) {
      return { success: false, error: check.reason, suggestion: check.suggestion };
    }
    
    // Try to get media stream to test permissions
    const stream = await navigator.mediaDevices.getUserMedia({ 
      video: true, 
      audio: true 
    });
    
    // Stop the stream immediately since we're just testing
    stream.getTracks().forEach(track => track.stop());
    
    return { success: true, message: 'Media permissions granted' };
  } catch (error) {
    let suggestion = '';
    if (error.name === 'NotAllowedError') {
      suggestion = 'Please allow camera and microphone access when prompted.';
    } else if (error.name === 'NotFoundError') {
      suggestion = 'No camera or microphone found. Please check your devices.';
    } else if (error.name === 'NotSupportedError') {
      suggestion = 'Media capture not supported. Try using HTTPS or a different browser.';
    }
    
    return { 
      success: false, 
      error: error.message, 
      errorName: error.name,
      suggestion 
    };
  }
};

export const isSecureContext = () => {
  if (typeof window === 'undefined') return false;
  return window.isSecureContext || window.location.protocol === 'https:' || 
         window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
};