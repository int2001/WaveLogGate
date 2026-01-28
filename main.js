/**
 * WaveLogGate - Main Process Entry Point
 * An Electron-based gateway application that connects WSJT-X/FLRig/FLDigi to WaveLog
 */

const { app, BrowserWindow, globalShortcut, Notification, powerSaveBlocker, dialog, shell } = require('electron/main');
const path = require('node:path');
const { ipcMain } = require('electron');
const net = require('net');
const fs = require('fs');

// Import refactored modules
const { defaultcfg, get_config, set_config } = require('./src/main/config/config');
const { create_profile, delete_profile, rename_profile, switch_profile } = require('./src/main/config/profiles');
const { freqToBand, parseADIF, writeADIF } = require('./src/main/adif/adif-service');
const { send2wavelog } = require('./src/main/wavelog/wavelog-api');
const { get_modes, getClosestMode, settrx, httpPost } = require('./src/main/radio/radio-service');
const { startUdpServer } = require('./src/main/servers/udp-server');
const { startQsyServer } = require('./src/main/servers/qsy-server');
const { startWebSocketServer, startSecureWebSocketServer, broadcastRadioStatus } = require('./src/main/servers/websocket-server');
const { setupCertificates, getCaCertificate, isCertificateInstalled, installCertificate } = require('./src/main/ssl/certificate');
const { checkForUpdates } = require('./src/main/update/update-checker');
const { show_noti } = require('./src/main/utils/notifications');
const { shutdownApplication, cleanupConnections } = require('./src/main/utils/shutdown');
const { fmt } = require('./src/main/utils/date-utils');

// In some cases we need to make the WLgate window resizable (for example for tiling window managers)
// Default: false
const resizable = process.env.WLGATE_RESIZABLE === 'true' || false;
const sleepable = process.env.WLGATE_SLEEP === 'true' || false;

const gotTheLock = app.requestSingleInstanceLock();

let powerSaveBlockerId;
let s_mainWindow;
let certInstallWindow;
let pendingCertInstall = false; // Track if cert install needs to be shown
let msgbacklog = [];

// Server instances
let servers = {
	udp: null,
	qsy: null,
	ws: null,
	wsClients: new Set(),
	wss: null,
	wssClients: new Set(),
	https: null,
	activeConnections: new Set(),
	activeHttpRequests: new Set()
};

// Certificate paths for HTTPS server
let certPaths = {
	key: null,
	cert: null
};

const DemoAdif = '<call:5>DJ7NT <gridsquare:4>JO30 <mode:3>FT8 <rst_sent:3>-15 <rst_rcvd:2>33 <qso_date:8>20240110 <time_on:6>051855 <qso_date_off:8>20240110 <time_off:6>051855 <band:3>40m <freq:8>7.155783 <station_callsign:5>TE1ST <my_gridsquare:6>JO30OO <eor>';

if (require('electron-squirrel-startup')) app.quit();

// Current configuration
let currentConfig = null;
let isShuttingDown = false;

// =============================================================================
// IPC Handlers
// =============================================================================

ipcMain.on("set_config", async (event, arg) => {
	currentConfig = arg;
	const result = set_config(arg);
	event.returnValue = result;
});

ipcMain.on("resize", async (event, arg) => {
	const newsize = arg;
	s_mainWindow.setContentSize(newsize.width, newsize.height, newsize.ani);
	s_mainWindow.setSize(newsize.width, newsize.height, newsize.ani);
	event.returnValue = true;
});

ipcMain.on("get_config", async (event, arg) => {
	const realcfg = get_config(arg);
	currentConfig = realcfg;
	event.returnValue = realcfg;
});

ipcMain.on("setCAT", async (event, arg) => {
	settrx(arg, '', currentConfig.profiles[currentConfig.profile ?? 0], servers.activeConnections);
	event.returnValue = true;
});

ipcMain.on("quit", async (event, arg) => {
	console.log('Quit requested from renderer');
	shutdownApplication(servers, s_mainWindow, { value: isShuttingDown });
	app.quit();
	event.returnValue = true;
});

ipcMain.on("radio_status_update", async (event, arg) => {
	// Broadcast radio status updates from renderer to WebSocket clients
	broadcastRadioStatus(arg, servers.wsClients, servers.wssClients);
	event.returnValue = true;
});

ipcMain.on("get_ca_cert", async (event) => {
	// Return the CA certificate for display/installation
	const caCert = getCaCertificate(app);
	event.returnValue = caCert;
});

ipcMain.on("install_ca_cert", async (event) => {
	// Attempt to install the CA certificate
	const result = await installCertificate(app);
	event.returnValue = result;
});

ipcMain.on("get_cert_info", async (event) => {
	// Return certificate installation info for the UI
	const userDataPath = app.getPath('userData');
	const certPath = path.join(userDataPath, 'certs', 'server.crt');

	event.returnValue = {
		certPath: certPath,
		platform: process.platform,
		hasCert: fs.existsSync(certPath)
	};
});

ipcMain.on("close_cert_install_window", async () => {
	if (certInstallWindow && !certInstallWindow.isDestroyed()) {
		certInstallWindow.close();
	}
});

ipcMain.on("check_for_updates", async (event) => {
	// Manual update check triggered from renderer
	checkForUpdates(app);
	event.returnValue = true;
});

// Dynamic Profile System IPC Handlers

ipcMain.on("create_profile", async (event, name) => {
	const result = create_profile(name, currentConfig);
	event.returnValue = result;
});

ipcMain.on("delete_profile", async (event, index) => {
	const result = delete_profile(index, currentConfig);
	event.returnValue = result;
});

ipcMain.on("rename_profile", async (event, index, newName) => {
	const result = rename_profile(index, newName, currentConfig);
	event.returnValue = result;
});

ipcMain.on("switch_profile", async (event, index) => {
	const result = switch_profile(index, currentConfig);
	event.returnValue = result;
});

ipcMain.on("test", async (event, arg) => {
	let result = {};
	let plain;
	try {
		plain = await send2wavelog(arg, DemoAdif, true);
	} catch (e) {
		plain = e;
		console.log(plain);
	} finally {
		try {
			result.payload = JSON.parse(plain.resString);
		} catch (ee) {
			result.payload = plain.resString;
		} finally {
			result.statusCode = plain.statusCode;
			event.returnValue = result;
		}
	}
});

// =============================================================================
// Helper Functions
// =============================================================================

function tomsg(msg) {
	try {
		s_mainWindow.webContents.send('updateMsg', msg);
	} catch (e) {
		msgbacklog.push(msg);
	}
}

function showCertInstallWindow() {
	// Close existing window if open
	if (certInstallWindow && !certInstallWindow.isDestroyed()) {
		certInstallWindow.focus();
		return;
	}

	// If main window is not ready yet, mark as pending and return
	if (!s_mainWindow || s_mainWindow.isDestroyed()) {
		pendingCertInstall = true;
		console.log('Main window not ready, cert install will show after window is ready');
		return;
	}

	pendingCertInstall = false;

	// Determine if we should attach to parent
	const useParent = s_mainWindow && !s_mainWindow.isDestroyed() && s_mainWindow.isVisible();

	certInstallWindow = new BrowserWindow({
		width: 600,
		height: 500,
		resizable: false,
		...(useParent ? { parent: s_mainWindow, modal: true } : {}),
		autoHideMenuBar: app.isPackaged,
		webPreferences: {
			contextIsolation: false,
			nodeIntegration: true,
			devTools: !app.isPackaged,
			enableRemoteModule: true,
			preload: path.join(__dirname, 'preload.js')
		}
	});

	if (app.isPackaged) {
		certInstallWindow.setMenu(null);
	}

	certInstallWindow.loadFile('cert-install.html');
	certInstallWindow.setTitle('WaveLogGate - SSL Certificate Installation');

	certInstallWindow.on('closed', () => {
		certInstallWindow = null;
	});
}

// =============================================================================
// Application Lifecycle
// =============================================================================

app.disableHardwareAcceleration();

function createWindow() {
	const mainWindow = new BrowserWindow({
		width: 430,
		height: 250,
		resizable: resizable,
		autoHideMenuBar: app.isPackaged,
		webPreferences: {
			contextIsolation: false,
			backgroundThrottling: false,
			nodeIntegration: true,
			devTools: !app.isPackaged,
			enableRemoteModule: true,
			preload: path.join(__dirname, 'preload.js')
		}
	});
	if (app.isPackaged) {
		mainWindow.setMenu(null);
	}

	mainWindow.loadFile('index.html');
	mainWindow.setTitle(require('./package.json').name + " V" + require('./package.json').version);

	return mainWindow;
}

app.on('before-quit', () => {
	console.log('before-quit event triggered');
	shutdownApplication(servers, s_mainWindow, { value: isShuttingDown });
});

process.on('SIGINT', () => {
	console.log('SIGINT received, initiating shutdown...');
	shutdownApplication(servers, s_mainWindow, { value: isShuttingDown });
	process.exit(0);
});

app.on('will-quit', () => {
	try {
		if (!sleepable && powerSaveBlockerId !== undefined) {
			powerSaveBlocker.stop(powerSaveBlockerId);
		}
	} catch (e) {
		console.log(e);
	}
});

// =============================================================================
// Server Initialization
// =============================================================================

function startserver() {
	try {
		// Setup SSL certificates
		const certResult = setupCertificates(app);
		if (certResult.success) {
			certPaths = certResult.certPaths;
		}

		tomsg('Waiting for QSO / Listening on UDP 2333');

		// Prompt for certificate installation if needed
		if (certResult.success) {
			const certInstalled = isCertificateInstalled(app);

			if (certResult.newlyGenerated || !certInstalled) {
				console.log('Certificate installation prompt needed');
				setTimeout(() => {
					showCertInstallWindow();
				}, 2000);
			} else {
				console.log('Certificate is installed in system trust store');
			}
		}

		// Get current config for servers
		const config = currentConfig || get_config();

		// Create QSY server (HTTP/HTTPS on port 54321)
		servers.qsy = startQsyServer(certPaths, (qrg, mode) => {
			settrx(qrg, mode, config.profiles[config.profile ?? 0], servers.activeConnections);
		});

		// Start UDP server for WSJT-X (port 2333)
		servers.udp = startUdpServer(2333, config, tomsg, s_mainWindow);

		// Start WebSocket server (port 54322)
		const wsResult = startWebSocketServer();
		servers.ws = wsResult.server;
		servers.wsClients = wsResult.clients;

		// Start Secure WebSocket server (port 54323)
		const wssResult = startSecureWebSocketServer(certPaths);
		servers.wss = wssResult.server;
		servers.wssClients = wssResult.clients;
		servers.https = wssResult.httpsServer;

	} catch (e) {
		tomsg('Some other Tool blocks Port 2333 or 54321. Stop it, and restart this');
		console.error('Error starting servers:', e);
	}
}

// =============================================================================
// App Startup
// =============================================================================

if (!gotTheLock) {
	// Another instance is running
	console.log('Another instance is running, requesting it to quit...');
	setTimeout(() => {
		app.relaunch();
		app.exit(0);
	}, 1000);
} else {
	// Handle second instance
	app.on('second-instance', (event, commandLine, workingDirectory) => {
		console.log('Second instance detected, quitting to let new instance take over...');
		app.quit();
	});

	// Initialize configuration
	currentConfig = get_config();

	startserver();

	app.whenReady().then(() => {
		if (!sleepable) {
			powerSaveBlockerId = powerSaveBlocker.start('prevent-app-suspension');
		}
		s_mainWindow = createWindow();
		globalShortcut.register('Control+Shift+I', () => { return false; });
		app.on('activate', function () {
			if (BrowserWindow.getAllWindows().length === 0) createWindow();
		});
		s_mainWindow.webContents.once('dom-ready', function () {
			if (msgbacklog.length > 0) {
				s_mainWindow.webContents.send('updateMsg', msgbacklog.pop());
			}
			// Check for updates on startup
			checkForUpdates(app);
		});

		// Show certificate install window if pending
		if (pendingCertInstall) {
			setTimeout(() => {
				showCertInstallWindow();
			}, 500);
		}
	});
}

app.on('window-all-closed', function () {
	console.log('All windows closed, initiating shutdown...');
	if (!isShuttingDown) {
		shutdownApplication(servers, s_mainWindow, { value: isShuttingDown });
	}
	if (process.platform !== 'darwin') app.quit();
	else app.quit();
});
