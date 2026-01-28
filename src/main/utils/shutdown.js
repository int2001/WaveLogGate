/**
 * Shutdown and cleanup utilities for WaveLogGate
 */

const WebSocket = require('ws');

/**
 * Clean up active TCP connections and HTTP requests
 * @param {Set} activeConnections - Set of active TCP connections
 * @param {Set} activeHttpRequests - Set of active HTTP requests
 */
function cleanupConnections(activeConnections, activeHttpRequests) {
	console.log('Cleaning up active TCP connections...');

	// Close all tracked TCP connections
	activeConnections.forEach(connection => {
		try {
			if (connection && !connection.destroyed) {
				connection.destroy();
				console.log('Closed TCP connection');
			}
		} catch (error) {
			console.error('Error closing TCP connection:', error);
		}
	});

	// Clear the connections set
	activeConnections.clear();
	console.log('All TCP connections cleaned up');

	// Abort all in-flight HTTP requests
	activeHttpRequests.forEach(request => {
		try {
			request.abort();
			console.log('Aborted HTTP request');
		} catch (error) {
			console.error('Error aborting HTTP request:', error);
		}
	});

	// Clear the HTTP requests set
	activeHttpRequests.clear();
	console.log('All HTTP requests aborted');
}

/**
 * Gracefully shutdown all servers and connections
 * @param {Object} servers - Object containing all server references
 * @param {Object} mainWindow - The main window reference
 * @param {boolean} isShuttingDown - Flag to prevent duplicate shutdown
 */
function shutdownApplication(servers, mainWindow, isShuttingDown) {
	if (isShuttingDown.value) {
		console.log('Shutdown already in progress, ignoring duplicate request');
		return;
	}

	isShuttingDown.value = true;
	console.log('Initiating application shutdown...');

	try {
		// Signal renderer to clear timers and connections
		if (mainWindow && !mainWindow.isDestroyed()) {
			console.log('Sending cleanup signal to renderer...');
			mainWindow.webContents.send('cleanup');
		}

		// Clean up TCP connections
		cleanupConnections(servers.activeConnections, servers.activeHttpRequests);

		// Close all servers
		if (servers.udp) {
			console.log('Closing UDP server...');
			try {
				servers.udp.close();
			} catch (e) {
				console.error('Error closing UDP server:', e);
			}
			servers.udp = null;
		}
		if (servers.qsy) {
			console.log('Closing QSY server...');
			try {
				servers.qsy.close();
			} catch (e) {
				console.error('Error closing QSY server:', e);
			}
			servers.qsy = null;
		}
		if (servers.ws) {
			console.log('Closing WebSocket server and clients...');
			// Close all WebSocket client connections with explicit termination
			servers.wsClients.forEach(client => {
				try {
					if (client.readyState === WebSocket.OPEN || client.readyState === WebSocket.CONNECTING) {
						client.close(1001, 'Server shutting down');
					}
				} catch (e) {
					// Client may already be closed, try terminate
					try {
						client.terminate();
					} catch (terminateError) {
						// Ignore, client is gone
					}
				}
			});
			servers.wsClients.clear();
			try {
				servers.ws.close();
			} catch (e) {
				console.error('Error closing WebSocket server:', e);
			}
			// ws will be set to null by the 'close' event handler
		}
		if (servers.wss) {
			console.log('Closing Secure WebSocket server and clients...');
			// Close all Secure WebSocket client connections with explicit termination
			servers.wssClients.forEach(client => {
				try {
					if (client.readyState === WebSocket.OPEN || client.readyState === WebSocket.CONNECTING) {
						client.close(1001, 'Server shutting down');
					}
				} catch (e) {
					// Client may already be closed, try terminate
					try {
						client.terminate();
					} catch (terminateError) {
						// Ignore, client is gone
					}
				}
			});
			servers.wssClients.clear();
			try {
				servers.wss.close();
			} catch (e) {
				console.error('Error closing Secure WebSocket server:', e);
			}
			// wss will be set to null by the 'close' event handler
		}
		if (servers.https) {
			console.log('Closing HTTPS server...');
			try {
				servers.https.close();
			} catch (e) {
				console.error('Error closing HTTPS server:', e);
			}
			// https will be set to null by the 'close' event handler
		}
	} catch (error) {
		console.error('Error during server shutdown:', error);
	}
}

module.exports = {
	cleanupConnections,
	shutdownApplication
};
