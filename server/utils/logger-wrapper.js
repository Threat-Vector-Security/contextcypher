try {
    module.exports = require('./logger-production');
} catch (e) {
    module.exports = require('./logger');
}
