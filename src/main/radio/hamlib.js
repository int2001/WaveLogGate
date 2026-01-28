/**
 * Hamlib TCP client for WaveLogGate
 */

const net = require('net');

/**
 * Send a command to Hamlib via TCP
 * @param {string} host - Hamlib host
 * @param {number} port - Hamlib port
 * @param {string} command - Command to send
 * @param {Set} activeConnections - Set to track active connections
 * @returns {Promise<string>} Response from Hamlib
 */
function sendHamlibCommand(host, port, command, activeConnections) {
	return new Promise((resolve, reject) => {
		const client = net.createConnection({ host, port }, () => {
			client.write(command + "\n");
		});

		// Track the connection for cleanup
		activeConnections.add(client);

		client.on('data', (data) => {
			const response = data.toString();
			if (response.startsWith("RPRT")) {
				activeConnections.delete(client);
				client.end();
				reject(new Error('Hamlib error response'));
			} else {
				activeConnections.delete(client);
				client.end();
				resolve(response.split('\n')[0]);
			}
		});

		client.on('error', (err) => {
			activeConnections.delete(client);
			reject(err);
		});

		client.on("close", () => {
			activeConnections.delete(client);
		});
	});
}

/**
 * Set frequency on Hamlib
 * @param {string} host - Hamlib host
 * @param {number} port - Hamlib port
 * @param {number} frequency - Frequency in Hz
 * @param {Set} activeConnections - Set to track active connections
 * @returns {Promise<string>} Response from Hamlib
 */
function setHamlibFrequency(host, port, frequency, activeConnections) {
	return sendHamlibCommand(host, port, "F " + frequency, activeConnections);
}

/**
 * Set mode on Hamlib
 * @param {string} host - Hamlib host
 * @param {number} port - Hamlib port
 * @param {string} mode - Mode to set
 * @param {Set} activeConnections - Set to track active connections
 * @returns {Promise<string>} Response from Hamlib
 */
function setHamlibMode(host, port, mode, activeConnections) {
	return sendHamlibCommand(host, port, "M " + mode + " 0", activeConnections);
}

module.exports = {
	sendHamlibCommand,
	setHamlibFrequency,
	setHamlibMode
};
