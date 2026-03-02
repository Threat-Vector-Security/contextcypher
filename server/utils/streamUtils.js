// Utility functions for HTTP response stream handling

/**
 * Safely write to an HTTP response stream that may already be closed.
 * Prevents ERR_STREAM_WRITE_AFTER_END crashes when the client
 * disconnects in the middle of Server-Sent-Events streaming.
 * @param {Object} res - Express response object
 * @param {string} chunk - Data to write
 * @returns {boolean} - Whether the write was successful
 */
function safeWrite(res, chunk) {
  if (!res || res.writableEnded || res.destroyed) {
    // Use console for logging since logger might not be available
    console.debug('safeWrite: Response not writable', {
      hasRes: !!res,
      writableEnded: res?.writableEnded,
      destroyed: res?.destroyed
    });
    return false;
  }
  try {
    const writeResult = res.write(chunk);
    if (!writeResult) {
      console.debug('safeWrite: Buffer full, write returned false');
    }
    return writeResult;
  } catch (err) {
    try {
      console.error('safeWrite error:', {
        message: err.message,
        code: err.code,
        writableEnded: res?.writableEnded,
        destroyed: res?.destroyed
      });
    } catch (_) {/* ignore logging failure */}
    return false;
  }
}

module.exports = {
  safeWrite
};