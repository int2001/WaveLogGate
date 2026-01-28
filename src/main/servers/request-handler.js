/**
 * HTTP request handler for QSY server
 */

/**
 * Create an HTTP request handler for both HTTP and HTTPS servers
 * @param {Function} settrx - Function to set radio frequency/mode
 * @returns {Function} Request handler function
 */
function createRequestHandler(settrx) {
	return function (req, res) {
		// Handle CORS preflight requests (OPTIONS)
		if (req.method === 'OPTIONS') {
			res.setHeader('Access-Control-Allow-Origin', '*');
			res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
			res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
			res.setHeader('Access-Control-Max-Age', '86400');
			res.writeHead(204);
			res.end();
			return;
		}

		// Handle QSY requests
		res.setHeader('Access-Control-Allow-Origin', '*');
		res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
		res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

		const parts = req.url.substr(1).split('/');
		const qrg = parts[0];
		const mode = parts[1] || '';

		if (Number.isInteger(Number.parseInt(qrg))) {
			settrx(qrg, mode);
			res.writeHead(200, { 'Content-Type': 'text/plain' });
			res.end('OK');
		} else {
			res.writeHead(400, { 'Content-Type': 'text/plain' });
			res.end('Invalid frequency');
		}
	};
}

module.exports = {
	createRequestHandler
};
