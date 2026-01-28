/**
 * QSY server (HTTP/HTTPS) for WaveLogGate
 */

const http = require('http');
const httpolyglot = require('httpolyglot');
const { createRequestHandler } = require('./request-handler');

/**
 * Start the QSY server (HTTP/HTTPS on port 54321)
 * @param {Object} certPaths - Certificate paths {key, cert}
 * @param {Function} settrx - Function to set radio frequency/mode
 * @returns {Object} Server instance
 */
function startQsyServer(certPaths, settrx) {
	const requestHandler = createRequestHandler(settrx);

	if (certPaths && certPaths.key && certPaths.cert) {
		// Create httpolyglot server (handles both HTTP and HTTPS on same port)
		const serverOptions = {
			key: certPaths.key,
			cert: certPaths.cert,
			minVersion: 'TLSv1.2'
		};

		const qsyServer = httpolyglot.createServer(serverOptions, requestHandler);
		qsyServer.on('error', (err) => {
			if (err.code === 'EADDRINUSE') {
				console.error('QSY server port 54321 already in use');
			} else {
				console.error('QSY server error:', err);
			}
		});
		qsyServer.listen(54321, () => {
			console.log('Dual-mode HTTP/HTTPS QSY server listening on port 54321');
		});
		return qsyServer;
	} else {
		// Fallback to HTTP-only if certificates are not available
		const qsyServer = http.createServer(requestHandler);
		qsyServer.on('error', (err) => {
			if (err.code === 'EADDRINUSE') {
				console.error('QSY server port 54321 already in use');
			} else {
				console.error('QSY server error:', err);
			}
		});
		qsyServer.listen(54321, () => {
			console.log('HTTP-only QSY server listening on port 54321');
		});
		return qsyServer;
	}
}

module.exports = {
	startQsyServer
};
