/**
 * WebSocket server for WaveLogGate
 * Broadcasts real-time radio status to connected clients
 */

const WebSocket = require('ws');
const https = require('https');

/**
 * Start the WebSocket server (port 54322)
 * @returns {Object} WebSocket server instance
 */
function startWebSocketServer() {
	let wsServer = null;
	let currentCAT = null;
	const wsClients = new Set();

	try {
		wsServer = new WebSocket.Server({
			port: 54322,
			exclusive: true,
			clientTracking: true // Enable built-in client tracking
		});

		wsServer.on('connection', (ws) => {
			wsClients.add(ws);
			console.log('WebSocket client connected');

			// Set up cleanup for this connection
			const cleanupClient = () => {
				wsClients.delete(ws);
				// Ensure socket is fully cleaned up
				if (ws.readyState !== WebSocket.CLOSED) {
					ws.terminate();
				}
			};

			ws.on('close', cleanupClient);

			ws.on('error', (error) => {
				console.error('WebSocket client error:', error);
				cleanupClient();
			});

			// Handle unexpected termination
			ws.on('unexpected-response', (req, res) => {
				console.error('WebSocket unexpected response:', res.statusCode);
				cleanupClient();
			});

			// Send current radio status on connection
			try {
				ws.send(JSON.stringify({
					type: 'welcome',
					message: 'Connected to WaveLogGate WebSocket server'
				}));
				// No currentCAT to broadcast yet, wssClients not available here
			} catch (sendError) {
				console.error('Error sending welcome message:', sendError);
				cleanupClient();
			}
		});

		wsServer.on('error', (error) => {
			console.error('WebSocket server error:', error);
			// If server fails critically, nullify it so shutdown knows it's gone
			if (error.code === 'EADDRINUSE') {
				console.error('Port 54322 already in use, WebSocket server not started');
				wsServer = null;
			}
		});

		wsServer.on('close', () => {
			console.log('WebSocket server closed');
			wsServer = null;
		});

		console.log('WebSocket server started on port 54322');
	} catch (e) {
		console.error('WebSocket server startup error:', e);
		wsServer = null;
	}

	return { server: wsServer, clients: wsClients };
}

/**
 * Start the Secure WebSocket server (port 54323)
 * @param {Object} certPaths - Certificate paths {key, cert}
 * @returns {Object} Secure WebSocket server instance
 */
function startSecureWebSocketServer(certPaths) {
	let wssServer = null;
	let wssHttpsServer = null;
	let currentCAT = null;
	const wssClients = new Set();

	if (!certPaths || !certPaths.key || !certPaths.cert) {
		console.log('No SSL certificates available, skipping secure WebSocket server');
		return { httpsServer: null, server: null, clients: wssClients };
	}

	try {
		// Create HTTPS server first
		wssHttpsServer = https.createServer({
			key: certPaths.key,
			cert: certPaths.cert
		});

		// Handle HTTPS server errors
		wssHttpsServer.on('error', (error) => {
			console.error('HTTPS server error:', error);
			if (error.code === 'EADDRINUSE') {
				console.error('Port 54323 already in use, secure WebSocket server not started');
				wssHttpsServer = null;
				wssServer = null;
			}
		});

		wssHttpsServer.on('close', () => {
			console.log('HTTPS server closed');
			wssHttpsServer = null;
		});

		// Listen on port 54323 with callback
		wssHttpsServer.listen(54323, () => {
			console.log('HTTPS server listening on port 54323');

			// Attach WebSocket server to the HTTPS server
			wssServer = new WebSocket.Server({ server: wssHttpsServer, clientTracking: true });

			wssServer.on('connection', (ws) => {
				wssClients.add(ws);
				console.log('Secure WebSocket client connected');

				// Set up cleanup for this connection
				const cleanupClient = () => {
					wssClients.delete(ws);
					// Ensure socket is fully cleaned up
					if (ws.readyState !== WebSocket.CLOSED) {
						ws.terminate();
					}
				};

				ws.on('close', cleanupClient);

				ws.on('error', (error) => {
					console.error('Secure WebSocket client error:', error);
					cleanupClient();
				});

				// Handle unexpected termination
				ws.on('unexpected-response', (req, res) => {
					console.error('Secure WebSocket unexpected response:', res.statusCode);
					cleanupClient();
				});

				// Send current radio status on connection
				try {
					ws.send(JSON.stringify({
						type: 'welcome',
						message: 'Connected to WaveLogGate Secure WebSocket server'
					}));
					// currentCAT will be sent when renderer sends radio status updates
				} catch (sendError) {
					console.error('Error sending secure welcome message:', sendError);
					cleanupClient();
				}
			});

			wssServer.on('error', (error) => {
				console.error('Secure WebSocket server error:', error);
				// If the WebSocket server fails, we need to clean up the HTTPS server too
				if (wssHttpsServer) {
					wssHttpsServer.close();
					wssHttpsServer = null;
				}
				wssServer = null;
			});

			wssServer.on('close', () => {
				console.log('Secure WebSocket server closed');
				wssServer = null;
			});

			console.log('Secure WebSocket server started on port 54323');
		});

	} catch (e) {
		console.error('Secure WebSocket server startup error:', e);
		// Clean up any partially created resources
		if (wssHttpsServer) {
			try {
				wssHttpsServer.close();
			} catch (closeError) {
				// Ignore errors during cleanup
			}
			wssHttpsServer = null;
		}
		wssServer = null;
	}

	return { httpsServer: wssHttpsServer, server: wssServer, clients: wssClients };
}

/**
 * Broadcast radio status to all connected WebSocket clients
 * @param {Object} radioData - Radio status data
 * @param {Set} wsClients - Regular WebSocket clients
 * @param {Set} wssClients - Secure WebSocket clients
 */
function broadcastRadioStatus(radioData, wsClients, wssClients) {
	let message = {
		type: 'radio_status',
		frequency: radioData && radioData.frequency ? parseInt(radioData.frequency) : null,
		mode: radioData && radioData.mode ? radioData.mode : null,
		power: radioData && radioData.power ? radioData.power : null,
		radio: radioData && radioData.radio ? radioData.radio : 'wlstream',
		timestamp: Date.now()
	};
	// Only include frequency_rx if it's not null
	if (radioData && radioData.frequency_rx) {
		message.frequency_rx = parseInt(radioData.frequency_rx);
	}

	const messageStr = JSON.stringify(message);
	// Broadcast to regular WebSocket clients
	if (wsClients) {
		wsClients.forEach((client) => {
			if (client.readyState === WebSocket.OPEN) {
				client.send(messageStr);
			}
		});
	}
	// Broadcast to secure WebSocket clients
	if (wssClients) {
		wssClients.forEach((client) => {
			if (client.readyState === WebSocket.OPEN) {
				client.send(messageStr);
			}
		});
	}
}

module.exports = {
	startWebSocketServer,
	startSecureWebSocketServer,
	broadcastRadioStatus
};
