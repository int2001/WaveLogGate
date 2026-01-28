/**
 * FLRig XML-RPC client for WaveLogGate
 */

const http = require('http');

/**
 * Send a command to FLRig via XML-RPC
 * @param {string} url - FLRig URL (e.g., http://127.0.0.1:12345/)
 * @param {string} methodName - XML-RPC method name
 * @param {string} paramString - Parameter string for the method call
 * @returns {Promise<string>} Response string from FLRig
 */
function sendFlrigCommand(url, methodName, paramString = '') {
	const postData = '<?xml version="1.0"?>' +
		'<methodCall><methodName>' + methodName + '</methodName>' +
		(paramString ? '<params><param><value>' + paramString + '</value></param></params>' : '') +
		'</methodCall>';

	const options = {
		method: 'POST',
		headers: {
			'User-Agent': 'SW2WL_v' + require('electron').app.getVersion(),
			'Content-Length': postData.length
		}
	};

	return new Promise((resolve, reject) => {
		const req = http.request(url, options, (res) => {
			let body = [];
			res.on('data', (chunk) => body.push(chunk));
			res.on('end', () => {
				resolve(Buffer.concat(body).toString());
			});
		});

		req.on('error', (err) => {
			req.destroy();
			reject('Other Problem');
		});

		req.on('timeout', (err) => {
			req.destroy();
			reject('Timeout');
		});

		req.write(postData);
		req.end();
	});
}

/**
 * Set frequency on FLRig
 * @param {string} url - FLRig URL
 * @param {number} frequency - Frequency in Hz
 * @returns {Promise<string>} Response from FLRig
 */
function setFlrigFrequency(url, frequency) {
	return sendFlrigCommand(url, 'main.set_frequency', '<double>' + frequency + '</double>');
}

/**
 * Set mode on FLRig
 * @param {string} url - FLRig URL
 * @param {string} mode - Mode to set (e.g., 'CW', 'USB', 'LSB')
 * @returns {Promise<string>} Response from FLRig
 */
function setFlrigMode(url, mode) {
	return sendFlrigCommand(url, 'rig.set_modeA', mode);
}

module.exports = {
	sendFlrigCommand,
	setFlrigFrequency,
	setFlrigMode
};
