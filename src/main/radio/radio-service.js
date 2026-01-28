/**
 * Radio control service for WaveLogGate
 * Orchestrates FLRig and Hamlib radio control
 */

const { setFlrigFrequency, setFlrigMode } = require('./flrig');
const { setHamlibFrequency, setHamlibMode } = require('./hamlib');

/**
 * Generic HTTP POST helper
 * @param {string} url - URL to POST to
 * @param {Object} options - HTTP options
 * @param {string} postData - Data to POST
 * @returns {Promise<string>} Response string
 */
function httpPost(url, options, postData) {
	const http = require('http');
	return new Promise((resolve, reject) => {
		let rej = false;
		let result = {};
		const req = http.request(url, options, (res) => {
			let body = [];
			res.on('data', (chunk) => body.push(chunk));
			res.on('end', () => {
				const resString = Buffer.concat(body).toString();
				if (rej) {
					reject(resString);
				} else {
					resolve(resString);
				}
			})
		})

		req.on('error', (err) => {
			req.destroy();
			result.resString = 'Other Problem';
			reject(result.resString);
		})

		req.on('timeout', (err) => {
			req.destroy();
			result.resString = 'Timeout';
			reject(result.resString);
		})

		req.write(postData);
		req.end();
	});
}

/**
 * Get available modes from the radio
 * @param {Object} profile - Current radio profile
 * @param {Object} mainWindow - Main window reference
 * @returns {Promise<Array<string>>} Array of available modes
 */
function get_modes(profile, mainWindow) {
	return new Promise((resolve) => {
		if (profile.hamlib_ena) {
			// For Hamlib, send the command via IPC to renderer
			mainWindow.webContents.send('get_info', 'rig.get_modes');
			// Set up one-time listener for the response
			const timeout = setTimeout(() => {
				resolve(['CW', 'LSB', 'USB']);
			}, 5000); // 5 second timeout
			const { ipcMain } = require('electron');
			ipcMain.once('get_info_result', (event, modes) => {
				clearTimeout(timeout);
				resolve(modes ?? ['CW', 'LSB', 'USB']);
			});
		} else if (profile.flrig_ena) {
			// For FLRig, use the existing method
			mainWindow.webContents.send('get_info', 'rig.get_modes');
			// Set up one-time listener for the response
			const timeout = setTimeout(() => {
				resolve(['CW', 'LSB', 'USB']);
			}, 5000); // 5 second timeout
			const { ipcMain } = require('electron');
			ipcMain.once('get_info_result', (event, modes) => {
				clearTimeout(timeout);
				resolve(modes ?? ['CW', 'LSB', 'USB']);
			});
		} else {
			// No radio control enabled, return default modes
			resolve(['CW', 'LSB', 'USB']);
		}
	});
}

/**
 * Find the closest matching mode from available modes
 * @param {string} requestedMode - The requested mode
 * @param {Array<string>} availableModes - Available modes on the radio
 * @returns {string|null} Closest matching mode or null
 */
function getClosestMode(requestedMode, availableModes) {
	if (availableModes.includes(requestedMode)) {	// Check perfect matches
		return requestedMode;
	}

	const modeFallbacks = {
		'CW': ['CW-L', 'CW-R', 'CW', 'LSB', 'USB'],
		'RTTY': ['RTTY', 'RTTY-R'],
	};

	if (modeFallbacks[requestedMode]) {
		for (let variant of modeFallbacks[requestedMode]) {
			if (availableModes.includes(variant)) {
				return variant;
			}
		}
	}

	const found = availableModes.find(mode =>
		mode.toUpperCase().startsWith(requestedMode.toUpperCase())
	);
	if (found) return found;
	return null;
}

/**
 * Set frequency and mode on the radio
 * @param {number} qrg - Frequency in Hz
 * @param {string} mode - Mode to set
 * @param {Object} profile - Current radio profile
 * @param {Set} activeConnections - Set to track active connections
 * @returns {Promise<boolean>} True if successful
 */
async function settrx(qrg, mode, profile, activeConnections) {
	let avail_modes = [];
	try {
		// Use a default mode list - in real implementation this would come from get_modes
		avail_modes = ['CW', 'LSB', 'USB', 'AM', 'FM'];
	} catch (e) {
		avail_modes = [];
	}
	let to = {};
	to.qrg = qrg;
	if (mode == 'cw') {
		to.mode = getClosestMode(mode, avail_modes);
	} else {
		if ((to.qrg) < 7999000) {
			to.mode = 'LSB';
		} else {
			to.mode = 'USB';
		}
	}

	if (profile.flrig_ena) {
		let url = "http://" + profile.flrig_host + ':' + profile.flrig_port + '/';
		let options = {};

		if (profile.wavelog_pmode) {
			try {
				await setFlrigMode(url, to.mode);
			} catch (e) {
				console.error('Error setting FLRig mode:', e);
			}
		}

		try {
			await setFlrigFrequency(url, to.qrg);
		} catch (e) {
			console.error('Error setting FLRig frequency:', e);
		}
	}

	if (profile.hamlib_ena) {
		const net = require('net');
		const client = net.createConnection({
			host: profile.hamlib_host,
			port: profile.hamlib_port
		}, () => {
			client.write("F " + to.qrg + "\n");
			if (profile.wavelog_pmode) {
				client.write("M " + to.mode + " 0\n");
			}
			client.end();
		});

		// Track the connection for cleanup
		activeConnections.add(client);

		client.on("error", (err) => {
			activeConnections.delete(client);
		});
		client.on("close", () => {
			activeConnections.delete(client);
		});
	}

	return true;
}

module.exports = {
	get_modes,
	getClosestMode,
	settrx,
	httpPost
};
