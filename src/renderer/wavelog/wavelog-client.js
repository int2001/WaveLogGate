/**
 * WaveLog client for WaveLogGate renderer
 * Handles communication with WaveLog API
 */

const { ipcRenderer } = require('electron');
// jQuery is loaded globally in index.html

/**
 * Send radio status to WaveLog
 * @param {Object} CAT - Radio status data
 * @param {Object} config - Configuration object
 * @param {number} active_cfg - Active profile index
 * @returns {Promise<Response>} Fetch response
 */
async function informWavelog(CAT, config, active_cfg) {
	let data = {
		radio: config.profiles[active_cfg].wavelog_radioname || "WLGate",
		key: config.profiles[active_cfg].wavelog_key,
	};
	if (CAT.power !== undefined && CAT.power !== 0) {
		data.power = CAT.power;
	}
	if (CAT.split == '1') {
		data.frequency = CAT.vfoB;
		data.mode = CAT.modeB;
		data.frequency_rx = CAT.vfo;
		data.mode_rx = CAT.mode;
	} else {
		data.frequency = CAT.vfo;
		data.mode = CAT.mode;
	}

	console.log(data);
	ipcRenderer.send('radio_status_update', data);

	let x = await fetch(config.profiles[active_cfg].wavelog_url + '/api/radio', {
		method: 'POST',
		rejectUnauthorized: false,
		headers: {
			Accept: 'application.json',
			'Content-Type': 'application/json',
		},
		body: JSON.stringify(data)
	});
	return x;
}

/**
 * Get station list from WaveLog
 * @param {Object} config - Configuration object
 * @param {number} active_cfg - Active profile index
 * @returns {Promise<Object>} JSON response with station data
 */
async function getStations(config, active_cfg) {
	const select = $('#wavelog_id');
	select.empty();
	select.prop('disabled', true);
	try {
		const x = await fetch(config.profiles[active_cfg].wavelog_url + '/api/station_info/' + config.profiles[active_cfg].wavelog_key, {
			method: 'GET',
			rejectUnauthorized: false,
			headers: {
				Accept: 'application/json',
				'Content-Type': 'application/json',
			},
		});

		if (!x.ok) {
			throw new Error(`HTTP error! Status: ${x.status}`);
		}

		const data = await x.json();
		fillDropdown(data, config, active_cfg);

		return data;
	} catch (error) {
		select.append(new Option('Failed to load stations', '0'));
		console.error('Could not load station locations:', error.message);
		throw error;
	}
}

/**
 * Fill station dropdown with data
 * @param {Array} data - Array of station objects
 * @param {Object} config - Configuration object
 * @param {number} active_cfg - Active profile index
 */
function fillDropdown(data, config, active_cfg) {
	const select = $('#wavelog_id');
	select.empty();
	select.prop('disabled', false);

	data.forEach(function (station) {
		const optionText = station.station_profile_name + " (" + station.station_callsign + ", ID: " + station.station_id + ")";
		const optionValue = station.station_id;
		select.append(new Option(optionText, optionValue));
	});

	if (config.profiles[active_cfg].wavelog_id && data.some(station => station.station_id == config.profiles[active_cfg].wavelog_id)) {
		select.val(config.profiles[active_cfg].wavelog_id);
	} else {
		select.val(data.length > 0 ? data[0].station_id : null);
	}
}

module.exports = {
	informWavelog,
	getStations,
	fillDropdown
};
