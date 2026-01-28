/**
 * WaveLogGate - Renderer Process Entry Point
 * Handles UI logic and communication with main process
 */

const { ipcRenderer } = require('electron');
const net = require('net');

// Import refactored modules
const { select, resizeme, updateUtcTime } = require('./src/renderer/utils/ui-helpers');
const { cleanupConnections, cleanup } = require('./src/renderer/utils/cleanup');
const { load_config, updateRadioFields, saveConfig } = require('./src/renderer/config/config-ui');
const { get_trx } = require('./src/renderer/radio/radio-client');
const { getsettrx } = require('./src/renderer/radio/radio-poller');
const { informWavelog, getStations, fillDropdown } = require('./src/renderer/wavelog/wavelog-client');
const {
	openProfileManager,
	renderProfileList,
	createProfile,
	deleteProfile,
	renameProfile,
	switchToSelectedProfile,
	getSelectedProfileIndex,
	setSelectedProfileIndex
} = require('./src/renderer/profiles/profile-manager');

// jQuery and Bootstrap are loaded globally in index.html

// State variables
let cfg = {};
let active_cfg = 0;
let trxpoll = undefined;
let utcTimeInterval = undefined;
let activeConnections = new Set(); // Track active TCP connections in renderer
let activeAbortControllers = new Set(); // Track active HTTP requests for cancellation
let oldCat = { vfo: 0, mode: "SSB" };
let lastCat = 0;

// DOM elements (initialized inside $(document).ready())
let bt_toggle, bt_save, bt_quit, bt_test, input_key, input_url;

$(document).ready(function () {
	// Initialize DOM element references after DOM is ready
	bt_toggle = select("#toggle");
	bt_save = select("#save");
	bt_quit = select("#quit");
	bt_test = select("#test");
	input_key = select("#wavelog_key");
	input_url = select("#wavelog_url");

	load_config().then((loadedCfg) => {
		cfg = loadedCfg;
		active_cfg = cfg.profile || 0;

		// Update UI with profile name
		const profileName = cfg.profileNames?.[active_cfg] || `Profile ${active_cfg + 1}`;
		$("#toggle").html(profileName);

		// Update radio fields based on selection
		updateRadioFields(cfg, active_cfg);

		// Load stations if credentials are present
		if (cfg.profiles[active_cfg].wavelog_key != "" && cfg.profiles[active_cfg].wavelog_url != "") {
			getStations(cfg, active_cfg);
		}

		// Start radio polling if needed
		if (trxpoll === undefined) {
			const state = {
				config: cfg,
				active_cfg: active_cfg,
				trxpoll: trxpoll,
				oldCat: oldCat,
				lastCat: lastCat,
				activeAbortControllers: activeAbortControllers
			};
			getsettrx(state, (cat) => informWavelog(cat, cfg, active_cfg));
		}
	});

	bt_toggle.addEventListener('click', async () => {
		const idx = openProfileManager(cfg);
		setSelectedProfileIndex(idx);
	});

	bt_save.addEventListener('click', async () => {
		cfg = await saveConfig(cfg, active_cfg);
	});

	bt_quit.addEventListener('click', () => {
		const state = {
			trxpoll: trxpoll,
			utcTimeInterval: utcTimeInterval,
			activeConnections: activeConnections,
			activeAbortControllers: activeAbortControllers
		};
		cleanup(state); // Clear all timers and connections before quit
		const x = ipcRenderer.sendSync("quit", '');
	});

	bt_test.addEventListener('click', () => {
		cfg.profiles[active_cfg].wavelog_url = $("#wavelog_url").val().trim();
		cfg.profiles[active_cfg].wavelog_key = $("#wavelog_key").val().trim();
		cfg.profiles[active_cfg].wavelog_id = $("#wavelog_id").val().trim();
		cfg.profiles[active_cfg].wavelog_radioname = $("#wavelog_radioname").val().trim();
		const x = (ipcRenderer.sendSync("test", cfg.profiles[active_cfg]));
		if (x.payload.status == 'created') {
			$("#test").removeClass('btn-primary');
			$("#test").removeClass('btn-danger');
			$("#test").addClass('btn-success');
			$("#msg2").hide();
			$("#msg2").html("");
		} else {
			$("#test").removeClass('btn-primary');
			$("#test").removeClass('btn-success');
			$("#test").addClass('btn-danger');
			$("#msg2").show();
			$("#msg2").html("Test failed. Reason: " + x.payload.reason);
		}
	});

	input_key.addEventListener('change', () => {
		getStations(cfg, active_cfg);
	});
	input_url.addEventListener('change', () => {
		getStations(cfg, active_cfg);
	});
	$('#reload_icon').on('click', () => {
		getStations(cfg, active_cfg);
	});

	utcTimeInterval = setInterval(updateUtcTime, 1000);
	window.onload = updateUtcTime;

	$("#config-tab").on("click", function () {
		const obj = {};
		obj.width = 430;
		obj.height = 550;
		obj.ani = false;
		resizeme(obj);
	});

	$("#status-tab").on("click", function () {
		const obj = {};
		obj.width = 430;
		obj.height = 250;
		obj.ani = false;
		resizeme(obj);
	});

	ipcRenderer.on('get_info', async (event, arg) => {
		const { getInfo } = require('./src/renderer/radio/radio-client');
		const result = await getInfo(arg, cfg, active_cfg, activeAbortControllers);
		ipcRenderer.send('get_info_result', result);
	});

	// Handle cleanup request from main process
	ipcRenderer.on('cleanup', () => {
		const state = {
			trxpoll: trxpoll,
			utcTimeInterval: utcTimeInterval,
			activeConnections: activeConnections,
			activeAbortControllers: activeAbortControllers
		};
		cleanup(state);
	});

	// Dropdown change handler
	$('#radio_type').change(function () {
		updateRadioFields(cfg, active_cfg);
	});

	// Profile manager modal event listeners
	$('#btnCreateProfile').click(async () => {
		const result = await createProfile();
		if (result.success) {
			cfg = await ipcRenderer.sendSync("get_config", '');
			renderProfileList(cfg);
		}
	});
	$('#btnSelectProfile').click(async () => {
		const idx = getSelectedProfileIndex();
		const result = await switchToSelectedProfile(idx, cfg);
		if (result.success) {
			active_cfg = idx;
			cfg = await ipcRenderer.sendSync("get_config", '');
			$('#profileModal').modal('hide');
			load_config().then((loadedCfg) => {
				cfg = loadedCfg;
				updateRadioFields(cfg, active_cfg);
			});
			// Reset test button to default state
			$("#test").removeClass('btn-success');
			$("#test").removeClass('btn-danger');
			$("#test").addClass('btn-primary');
			$("#msg2").hide();
		}
	});
	$('#newProfileName').keypress(async (e) => {
		if (e.which === 13) {
			const result = await createProfile();
			if (result.success) {
				cfg = await ipcRenderer.sendSync("get_config", '');
				renderProfileList(cfg);
			}
		}
	});

	// Use event delegation for dynamically created radio buttons
	$('#profileList').on('change', 'input[type="radio"]', function () {
		setSelectedProfileIndex(parseInt($(this).val()));
	});

	// Use event delegation for rename and delete buttons
	$('#profileList').on('click', '.btn-rename', async function () {
		const index = parseInt($(this).closest('.list-group-item').data('index'));
		await renameProfile(index, cfg);
		cfg = await ipcRenderer.sendSync("get_config", '');
		renderProfileList(cfg);
	});

	$('#profileList').on('click', '.btn-delete', async function () {
		const index = parseInt($(this).closest('.list-group-item').data('index'));
		const result = await deleteProfile(index, cfg);
		if (result.success) {
			if ((cfg.profile || 0) === index) {
				active_cfg = 0;
			}
			cfg = await ipcRenderer.sendSync("get_config", '');
			renderProfileList(cfg);
		} else {
			alert(result.error);
		}
	});
});

// TX API callbacks from preload
window.TX_API.onUpdateMsg((value) => {
	$("#msg").html(value);
	$("#msg2").html("");
});

window.TX_API.onUpdateTX((value) => {
	if (value.created) {
		$("#log").html('<div class="alert alert-success" role="alert">' + value.qsos[0].TIME_ON + " " + value.qsos[0].CALL + " (" + (value.qsos[0].GRIDSQUARE || 'No Grid') + ") on " + (value.qsos[0].BAND || 'No BAND') + " (R:" + (value.qsos[0].RST_RCVD || 'No RST') + " / S:" + (value.qsos[0].RST_SENT || 'No RST') + ') - OK</div>');
	} else {
		$("#log").html('<div class="alert alert-danger" role="alert">' + value.qsos[0].TIME_ON + " " + value.qsos[0].CALL + " (" + (value.qsos[0].GRIDSQUARE || 'No Grid') + ") on " + (value.qsos[0].BAND || 'NO BAND') + " (R:" + (value.qsos[0].RST_RCVD || 'No RST') + " / S:" + (value.qsos[0].RST_SENT || 'No RST') + ') - Error<br/>Reason: ' + value.fail.payload.reason + '</div>');
	}
});
