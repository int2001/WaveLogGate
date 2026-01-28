/**
 * Radio polling for WaveLogGate renderer
 * Polls radio status every second and updates WaveLog
 */

const { ipcRenderer } = require('electron');
const { get_trx } = require('./radio-client');

/**
 * Deep equality check for objects
 * @param {Object} object1 - First object
 * @param {Object} object2 - Second object
 * @returns {boolean} True if objects are deeply equal
 */
const isDeepEqual = (object1, object2) => {
	const objKeys1 = Object.keys(object1);
	const objKeys2 = Object.keys(object2);

	if (objKeys1.length !== objKeys2.length) return false;

	for (const key of objKeys1) {
		const value1 = object1[key];
		const value2 = object2[key];

		const isObjects = isObject(value1) && isObject(value2);

		if ((isObjects && !isDeepEqual(value1, value2)) ||
			(!isObjects && value1 !== value2)
		) {
			return false;
		}
	}
	return true;
};

/**
 * Check if value is an object
 * @param {*} object - Value to check
 * @returns {boolean} True if value is an object
 */
const isObject = (object) => {
	return object != null && typeof object === "object";
};

/**
 * Poll radio status and update WaveLog
 * @param {Object} state - State object containing config, oldCat, lastCat, etc.
 * @param {Function} informWavelog - Function to send status to WaveLog
 */
function getsettrx(state, informWavelog) {
	const { config, active_cfg, activeAbortControllers } = state;

	if (config.profiles[active_cfg].flrig_ena || config.profiles[active_cfg].hamlib_ena) {
		console.log('Polling TRX ' + state.trxpoll);

		get_trx(config, active_cfg, activeAbortControllers).then(currentCat => {
			// Update display
			const currentTrxEl = document.getElementById("current_trx");
			if (currentTrxEl) {
				currentTrxEl.innerHTML = ((currentCat.vfo || 0) / (1000 * 1000)) + " MHz / " + (currentCat.mode || 'Unknown');
			}

			// Check if we should update WaveLog (every 30 minutes or on change)
			if (((Date.now() - state.lastCat) > (30 * 60 * 1000)) || (!(isDeepEqual(state.oldCat, currentCat)))) {
				console.log(informWavelog(currentCat));
			}

			state.oldCat = currentCat;
		}).catch(err => {
			console.error('Error polling radio:', err);
		});
	}

	// Schedule next poll
	state.trxpoll = setTimeout(() => {
		getsettrx(state, informWavelog);
	}, 1000);
}

module.exports = {
	getsettrx,
	isDeepEqual,
	isObject
};
