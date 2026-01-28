/**
 * Update checker for WaveLogGate
 * Checks GitHub for new releases
 */

const https = require('https');
const path = require('path');
const { Notification, dialog, shell } = require('electron/main');

/**
 * Get repository info from package.json
 * @returns {Object} Repository info with owner and repo
 */
function getRepoInfo() {
	try {
		const pkg = require('./package.json');
		if (pkg.repository && pkg.repository.url) {
			const match = pkg.repository.url.match(/github\.com[/:]([^/]+)\/([^/]+)/);
			if (match) {
				return { owner: match[1], repo: match[2].replace('.git', '') };
			}
		}
	} catch (e) {
		console.log('Could not read repository info:', e.message);
	}
	// Fallback to defaults
	return { owner: 'wavelog', repo: 'WaveLogGate' };
}

/**
 * Compare two version strings
 * @param {string} v1 - First version string
 * @param {string} v2 - Second version string
 * @returns {boolean} True if v2 > v1
 */
function isNewerVersion(v1, v2) {
	const parts1 = v1.split('.').map(Number);
	const parts2 = v2.split('.').map(Number);
	for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
		const p1 = parts1[i] || 0;
		const p2 = parts2[i] || 0;
		if (p2 > p1) return true;
		if (p2 < p1) return false;
	}
	return false;
}

/**
 * Show notification about available update
 * @param {string} version - New version number
 * @param {string} releaseUrl - URL to release page
 * @param {Object} app - Electron app instance
 */
function showUpdateNotification(version, releaseUrl, app) {
	// On Windows, use dialog because notification clicks don't work reliably
	if (process.platform === 'win32') {
		dialog.showMessageBox({
			type: 'info',
			title: 'WaveLogGate Update Available',
			message: `A new version is available!`,
			detail: `Version ${version} is ready to download. You are currently running v${app.getVersion()}.`,
			buttons: ['Go to Download', 'Later'],
			defaultId: 0,
			cancelId: 1
		}).then(result => {
			if (result.response === 0) {
				console.log('Opening download page:', releaseUrl);
				shell.openExternal(releaseUrl);
			}
		});
		return;
	}

	// On macOS/Linux, use native notification (click works on macOS)
	if (Notification.isSupported()) {
		const notification = new Notification({
			title: 'WaveLogGate Update Available',
			body: `Version ${version} is available. Click to download.`,
			icon: path.join(__dirname, '../../icon.png'),
			silent: false
		});

		notification.once('click', () => {
			console.log('Notification clicked, opening:', releaseUrl);
			shell.openExternal(releaseUrl);
		});

		notification.show();
	} else {
		// Fallback: log to console
		console.log(`Update available: ${version} - Download from: ${releaseUrl}`);
	}
}

/**
 * Check for updates via GitHub API
 * @param {Object} app - Electron app instance
 */
function checkForUpdates(app) {
	if (!app.isPackaged) {
		console.log('Skipping update check (development mode)');
		return;
	}

	const repoInfo = getRepoInfo();
	const currentVersion = app.getVersion();

	console.log(`Checking for updates (current: ${currentVersion})...`);

	const options = {
		hostname: 'api.github.com',
		path: `/repos/${repoInfo.owner}/${repoInfo.repo}/releases/latest`,
		headers: {
			'User-Agent': 'WaveLogGate'
		}
	};

	https.get(options, (res) => {
		let data = '';

		res.on('data', (chunk) => {
			data += chunk;
		});

		res.on('end', () => {
			try {
				const release = JSON.parse(data);
				const latestVersion = release.tag_name.replace(/^v/, '');

				console.log(`Latest version: ${latestVersion}`);

				if (isNewerVersion(currentVersion, latestVersion)) {
					console.log(`Update available: ${latestVersion}`);
					showUpdateNotification(latestVersion, release.html_url, app);
				} else {
					console.log('Already up to date');
				}
			} catch (e) {
				console.error('Error parsing release info:', e.message);
			}
		});
	}).on('error', (err) => {
		console.error('Error checking for updates:', err.message);
	});
}

module.exports = {
	checkForUpdates,
	getRepoInfo,
	isNewerVersion,
	showUpdateNotification
};
