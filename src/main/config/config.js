/**
 * Configuration management for WaveLogGate
 */

const storage = require('electron-json-storage');

// Default configuration object
const defaultcfg = {
	wavelog_url: "https://log.jo30.de/index.php",
	wavelog_key: "mykey",
	wavelog_id: "0",
	wavelog_radioname: 'WLGate',
	wavelog_pmode: true,
	flrig_host: '127.0.0.1',
	flrig_port: '12345',
	flrig_ena: false,
	hamlib_host: '127.0.0.1',
	hamlib_port: '4532',
	hamlib_ena: false,
	ignore_pwr: false,
};

/**
 * Get configuration from storage with migration logic
 * @param {string} arg - Optional profile index to load
 * @returns {Object} The configuration object
 */
function get_config(arg) {
	let storedcfg = storage.getSync('basic');
	let realcfg = {};

	// Old config not present, add default-cfg
	if (!(storedcfg.wavelog_url) && !(storedcfg.profiles)) {
		storedcfg = defaultcfg;
	}

	// Old Config without array? Convert it
	if (!(storedcfg.profiles)) {
		(realcfg.profiles = realcfg.profiles || []).push(storedcfg);
		realcfg.profiles.push(defaultcfg);
		realcfg.profile = (storedcfg.profile ?? 0);
	} else {
		realcfg = storedcfg;
	}

	// Migration: Add version and profileNames for dynamic profile system
	if (!realcfg.version || realcfg.version < 2) {
		realcfg.version = 2;
		if (!realcfg.profileNames) {
			realcfg.profileNames = realcfg.profiles.map((_, i) => `Profile ${i + 1}`);
		}
		storage.setSync('basic', realcfg, function (e) {
			if (e) throw e;
		});
	}

	// Set requested profile if specified
	if ((arg ?? '') !== '') {
		realcfg.profile = arg;
	}

	// Store one time to ensure it's saved
	storage.setSync('basic', realcfg, function (e) {
		if (e) throw e;
	});

	return realcfg;
}

/**
 * Set configuration to storage
 * @param {Object} config - The configuration object to save
 * @returns {Object} The saved configuration
 */
function set_config(config) {
	storage.setSync('basic', config, function (e) {
		if (e) throw e;
	});
	return config;
}

module.exports = {
	defaultcfg,
	get_config,
	set_config
};
