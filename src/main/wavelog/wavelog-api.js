/**
 * WaveLog API integration for WaveLogGate
 */

/**
 * Send ADIF data to WaveLog API
 * @param {Object} o_cfg - Configuration object with WaveLog connection details
 * @param {string} adif - ADIF string to send
 * @param {boolean} dryrun - Whether this is a test run (dry-run mode)
 * @returns {Promise<Object>} Result object with statusCode and resString
 */
function send2wavelog(o_cfg, adif, dryrun = false) {
	let clpayload = {};
	clpayload.key = o_cfg.wavelog_key.trim();
	clpayload.station_profile_id = o_cfg.wavelog_id.trim();
	clpayload.type = 'adif';
	clpayload.string = adif;
	const postData = JSON.stringify(clpayload);
	let httpmod = 'http';
	if (o_cfg.wavelog_url.toLowerCase().startsWith('https')) {
		httpmod = 'https';
	}
	const https = require(httpmod);
	const options = {
		method: 'POST',
		timeout: 5000,
		rejectUnauthorized: false,
		headers: {
			'Content-Type': 'application/json',
			'User-Agent': 'SW2WL_v' + require('electron').app.getVersion(),
			'Content-Length': postData.length
		}
	};

	return new Promise((resolve, reject) => {
		let rej = false;
		let result = {};
		let url = o_cfg.wavelog_url + '/api/qso';
		if (dryrun) { url += '/true'; }
		const req = https.request(url, options, (res) => {

			result.statusCode = res.statusCode;
			if (res.statusCode < 200 || res.statusCode > 299) {
				rej = true;
			}

			const body = [];
			res.on('data', (chunk) => body.push(chunk));
			res.on('end', () => {
				let resString = Buffer.concat(body).toString();
				if (rej) {
					if (resString.indexOf('html>') > 0) {
						resString = '{"status":"failed","reason":"wrong URL"}';
					}
					result.resString = resString;
					reject(result);
				} else {
					result.resString = resString;
					resolve(result);
				}
			})
		})

		req.on('error', (err) => {
			rej = true;
			req.destroy();
			result.resString = '{"status":"failed","reason":"internet problem"}';
			reject(result);
		})

		req.on('timeout', (err) => {
			rej = true;
			req.destroy();
			result.resString = '{"status":"failed","reason":"timeout"}';
			reject(result);
		})

		req.write(postData);
		req.end();
	});
}

module.exports = {
	send2wavelog
};
