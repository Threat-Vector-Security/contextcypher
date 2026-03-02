// Path configuration for the application

const path = require('path');

// Define directory paths for storing diagrams and threat intelligence data
const DIAGRAMS_DIR = path.join(__dirname, '../../data/diagrams');
const THREAT_INTEL_DIR = path.join(__dirname, '../../data/threat-intel');

// Debug mode flag
const DEBUG_MODE = process.env.DEBUG_MODE === 'true';

// Timeout configuration
const TIMEOUT_DURATION = 120000; // 120 seconds

module.exports = {
  DIAGRAMS_DIR,
  THREAT_INTEL_DIR,
  DEBUG_MODE,
  TIMEOUT_DURATION
};