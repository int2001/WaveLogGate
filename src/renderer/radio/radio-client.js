/**
 * Radio client for WaveLogGate renderer
 * Handles communication with FLRig and Hamlib
 */

const net = require('net');
const { ipcRenderer } = require('electron');

/**
 * Query radio for specific information
 * @param {string} which - Command to send (e.g., 'rig.get_vfo', 'rig.get_mode')
 * @param {Object} config - Configuration object
 * @param {number} active_cfg - Active profile index
 * @param {Set} activeAbortControllers - Set of active AbortControllers
 * @returns {Promise<string|Array>} Response from radio
 */
async function getInfo(which, config, active_cfg, activeAbortControllers) {
	if (config.profiles[active_cfg].flrig_ena) {
		const abortController = new AbortController();
		activeAbortControllers.add(abortController);

		try {
			const host = document.getElementById("radio_host")?.value || config.profiles[active_cfg].flrig_host;
			const port = document.getElementById("radio_port")?.value || config.profiles[active_cfg].flrig_port;

			const response = await fetch(
				"http://" + host + ':' + port, {
					method: 'POST',
					headers: {
						'Accept': 'application/json, application/xml, text/plain, text/html, *.*',
						'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8'
					},
					body: '<?xml version="1.0"?><methodCall><methodName>' + which + '</methodName></methodCall>',
					signal: abortController.signal
				}
			);

			const data = await response.text();
			const parser = new DOMParser();
			const xmlDoc = parser.parseFromString(data, "application/xml");

			const valueNode = xmlDoc.querySelector("methodResponse > params > param > value");

			if (!valueNode) {
				return null;
			}

			const arrayNode = valueNode.querySelector("array > data");
			if (arrayNode) {
				const items = Array.from(arrayNode.querySelectorAll("value string, value"))
					.map(node => node.textContent.trim());
				return items;
			} else {
				return valueNode.textContent.trim();
			}
		} catch (e) {
			return '';
		} finally {
			// Always clean up abort controller when done
			activeAbortControllers.delete(abortController);
		}
	}

	if (config.profiles[active_cfg].hamlib_ena) {
		const commands = {
			"rig.get_vfo": "f",
			"rig.get_mode": "m",
			"rig.get_modes": "M ? 0",
			"rig.get_ptt": 0,
			"rig.get_power": 0,
			"rig.get_split": 0,
			"rig.get_vfoB": 0,
			"rig.get_modeB": 0
		};

		const host = config.profiles[active_cfg].hamlib_host;
		const port = parseInt(config.profiles[active_cfg].hamlib_port, 10);

		return new Promise((resolve, reject) => {
			if (commands[which]) {
				const client = net.createConnection({ host, port }, () => {
					client.write(commands[which] + "\n");
				});

				// Note: caller should track this connection for cleanup
				client.on('data', (data) => {
					data = data.toString();
					if (data.startsWith("RPRT")) {
						reject();
					} else {
						if (which === 'rig.get_modes') {
							// Parse modes list - split by whitespace and filter empty strings
							const modes = data.trim().split(/\s+/).filter(mode => mode.length > 0);
							resolve(modes);
						} else {
							resolve(data.split('\n')[0]);
						}
					}
					client.end();
				});
				client.on('error', (err) => {
					reject();
				});
				client.on("close", () => {
					// Connection cleaned up by caller
				});
			} else {
				resolve(undefined);
			}
		});
	}
}

/**
 * Get current radio status (VFO, mode, PTT, power, etc.)
 * @param {Object} config - Configuration object
 * @param {number} active_cfg - Active profile index
 * @param {Set} activeAbortControllers - Set of active AbortControllers
 * @returns {Promise<Object>} Current radio status
 */
async function get_trx(config, active_cfg, activeAbortControllers) {
	let currentCat = {};
	currentCat.vfo = await getInfo('rig.get_vfo', config, active_cfg, activeAbortControllers);
	currentCat.mode = await getInfo('rig.get_mode', config, active_cfg, activeAbortControllers);
	currentCat.ptt = await getInfo('rig.get_ptt', config, active_cfg, activeAbortControllers);
	if (!config.profiles[active_cfg].ignore_pwr) {
		currentCat.power = await getInfo('rig.get_power', config, active_cfg, activeAbortControllers) ?? 0;
	}
	currentCat.split = await getInfo('rig.get_split', config, active_cfg, activeAbortControllers);
	currentCat.vfoB = await getInfo('rig.get_vfoB', config, active_cfg, activeAbortControllers);
	currentCat.modeB = await getInfo('rig.get_modeB', config, active_cfg, activeAbortControllers);

	return currentCat;
}

module.exports = {
	getInfo,
	get_trx
};
