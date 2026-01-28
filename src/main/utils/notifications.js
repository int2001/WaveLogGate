/**
 * Notification utilities for WaveLogGate
 */

const { Notification } = require('electron/main');

/**
 * Show a desktop notification
 * @param {string} arg - The message body for the notification
 */
function show_noti(arg) {
	if (Notification.isSupported()) {
		try {
			const notification = new Notification({
				title: 'Wavelog',
				body: arg
			});
			notification.show();
		} catch (e) {
			console.log("No notification possible on this system / ignoring");
		}
	} else {
		console.log("Notifications are not supported on this platform");
	}
}

module.exports = {
	show_noti
};
