/**
 * Cleanup utilities for WaveLogGate renderer
 */

const net = require('net');

/**
 * Clean up active TCP connections and HTTP requests
 * @param {Set} activeConnections - Set of active TCP connections
 * @param {Set} activeAbortControllers - Set of active AbortControllers
 */
function cleanupConnections(activeConnections, activeAbortControllers) {
	console.log('Cleaning up renderer TCP connections...');

	// Close all tracked TCP connections
	activeConnections.forEach(connection => {
		try {
			if (connection && !connection.destroyed) {
				connection.destroy();
				console.log('Closed renderer TCP connection');
			}
		} catch (error) {
			console.error('Error closing renderer TCP connection:', error);
		}
	});

	// Clear the connections set
	activeConnections.clear();
	console.log('All renderer TCP connections cleaned up');

	// Abort all in-flight HTTP requests
	activeAbortControllers.forEach(controller => {
		try {
			controller.abort();
			console.log('Aborted HTTP request');
		} catch (error) {
			console.error('Error aborting HTTP request:', error);
		}
	});

	// Clear the abort controllers set
	activeAbortControllers.clear();
	console.log('All HTTP requests aborted');
}

/**
 * Clean up all timers and connections
 * @param {Object} state - State object containing trxpoll, utcTimeInterval, etc.
 */
function cleanup(state) {
	// Clear radio polling timeout
	if (state.trxpoll) {
		clearTimeout(state.trxpoll);
		state.trxpoll = undefined;
		console.log('Cleared radio polling timeout');
	}

	// Clear UTC time update interval
	if (state.utcTimeInterval) {
		clearInterval(state.utcTimeInterval);
		state.utcTimeInterval = undefined;
		console.log('Cleared UTC time update interval');
	}

	// Clean up TCP connections
	cleanupConnections(state.activeConnections, state.activeAbortControllers);
}

module.exports = {
	cleanupConnections,
	cleanup
};
