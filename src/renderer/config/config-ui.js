/**
 * Configuration UI handling for WaveLogGate
 */

const { ipcRenderer } = require('electron');

/**
 * Load and populate configuration from main process
 * @returns {Promise<Object>} Configuration object
 */
async function load_config() {
	const cfg = await ipcRenderer.sendSync("get_config", '');
	const active_cfg = cfg.profile || 0;
	const profileName = cfg.profileNames?.[active_cfg] || `Profile ${active_cfg + 1}`;

	// Update UI with profile name
	const toggleBtn = document.getElementById("toggle");
	if (toggleBtn) toggleBtn.innerHTML = profileName;

	// Populate form fields
	const setVal = (id, val) => {
		const el = document.getElementById(id);
		if (el) el.value = val;
	};
	const setCheck = (id, val) => {
		const el = document.getElementById(id);
		if (el) el.checked = val;
	};

	setVal("wavelog_url", cfg.profiles[active_cfg].wavelog_url);
	setVal("wavelog_key", cfg.profiles[active_cfg].wavelog_key);
	setVal("wavelog_radioname", cfg.profiles[active_cfg].wavelog_radioname);
	setCheck("wavelog_pmode", cfg.profiles[active_cfg].wavelog_pmode);

	// Set radio type
	const radioTypeEl = document.getElementById('radio_type');
	if (radioTypeEl) {
		if (cfg.profiles[active_cfg].flrig_ena) {
			radioTypeEl.value = 'flrig';
		} else if (cfg.profiles[active_cfg].hamlib_ena) {
			radioTypeEl.value = 'hamlib';
		} else {
			radioTypeEl.value = 'none';
		}
	}

	return cfg;
}

/**
 * Update radio field labels and values based on selected radio type
 * @param {Object} cfg - Configuration object
 * @param {number} active_cfg - Active profile index
 */
function updateRadioFields(cfg, active_cfg) {
	const selectedRadio = document.getElementById('radio_type')?.value;

	// Reset all fields
	const setDisabled = (id, disabled) => {
		const el = document.getElementById(id);
		if (el) el.disabled = disabled;
	};
	const setText = (id, text) => {
		const el = document.getElementById(id);
		if (el) el.textContent = text;
	};
	const setVal = (id, val) => {
		const el = document.getElementById(id);
		if (el) el.value = val;
	};
	const setShow = (id, show) => {
		const el = document.getElementById(id);
		if (el) el.style.display = show ? 'block' : 'none';
	};

	setDisabled('radio_host', selectedRadio === 'none');
	setDisabled('radio_port', selectedRadio === 'none');
	setDisabled('wavelog_pmode', selectedRadio === 'none');
	setShow('hamlib_options', false);

	// Update field labels and values based on selection
	switch (selectedRadio) {
		case 'flrig':
			setText("host_label", "FLRig Host");
			setText("port_label", "FLRig Port");
			setText("pmode_label", "Set MODE via FLRig");
			setVal("radio_host", cfg.profiles[active_cfg].flrig_host || '127.0.0.1');
			setVal("radio_port", cfg.profiles[active_cfg].flrig_port || '12345');
			setCheck("wavelog_pmode", cfg.profiles[active_cfg].wavelog_pmode);
			break;
		case 'hamlib':
			setText("host_label", "Hamlib Host");
			setText("port_label", "Hamlib Port");
			setText("pmode_label", "Set MODE via Hamlib");
			setVal("radio_host", cfg.profiles[active_cfg].hamlib_host || '127.0.0.1');
			setVal("radio_port", cfg.profiles[active_cfg].hamlib_port || '4532');
			setCheck("wavelog_pmode", cfg.profiles[active_cfg].wavelog_pmode);
			setShow('hamlib_options', true);
			setCheck("ignore_pwr", cfg.profiles[active_cfg].ignore_pwr);
			break;
		case 'none':
		default:
			setText("host_label", "Radio Host");
			setText("port_label", "Radio Port");
			setText("pmode_label", "Set MODE via Radio");
			setVal("radio_host", '');
			setVal("radio_port", '');
			break;
	}
}

/**
 * Save current configuration
 * @param {Object} cfg - Configuration object
 * @param {number} active_cfg - Active profile index
 * @returns {Promise<Object>} Saved configuration
 */
async function saveConfig(cfg, active_cfg) {
	const getVal = (id) => {
		const el = document.getElementById(id);
		return el ? el.value.trim() : '';
	};
	const getCheck = (id) => {
		const el = document.getElementById(id);
		return el ? el.checked : false;
	};

	cfg.profile = active_cfg;
	cfg.profiles[cfg.profile].wavelog_url = getVal("wavelog_url");
	cfg.profiles[cfg.profile].wavelog_key = getVal("wavelog_key");
	cfg.profiles[cfg.profile].wavelog_id = getVal("wavelog_id");
	cfg.profiles[cfg.profile].wavelog_radioname = getVal("wavelog_radioname");
	cfg.profiles[cfg.profile].wavelog_pmode = getCheck("wavelog_pmode");

	// Save radio configuration based on selected radio type
	const selectedRadio = document.getElementById('radio_type')?.value;

	// Reset all radio settings first
	cfg.profiles[cfg.profile].flrig_ena = false;
	cfg.profiles[cfg.profile].hamlib_ena = false;

	switch (selectedRadio) {
		case 'flrig':
			cfg.profiles[cfg.profile].flrig_ena = true;
			cfg.profiles[cfg.profile].flrig_host = getVal("radio_host");
			cfg.profiles[cfg.profile].flrig_port = getVal("radio_port");
			break;
		case 'hamlib':
			cfg.profiles[cfg.profile].hamlib_ena = true;
			cfg.profiles[cfg.profile].hamlib_host = getVal("radio_host");
			cfg.profiles[cfg.profile].hamlib_port = getVal("radio_port");
			cfg.profiles[cfg.profile].ignore_pwr = getCheck("ignore_pwr");
			break;
		case 'none':
		default:
			// All radio settings already disabled
			break;
	}

	return await ipcRenderer.sendSync("set_config", cfg);
}

module.exports = {
	load_config,
	updateRadioFields,
	saveConfig
};
