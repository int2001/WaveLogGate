/**
 * UI helper utilities for WaveLogGate renderer
 */

const { ipcRenderer } = require('electron');

/**
 * Shorthand for document.querySelector
 * @param {string} selector - CSS selector
 * @returns {Element|null} Selected element
 */
function select(selector) {
	return document.querySelector(selector);
}

/**
 * Resize the main window
 * @param {Object} size - Size object with width, height, and ani properties
 * @returns {boolean} Result of resize operation
 */
function resizeme(size) {
	const x = ipcRenderer.sendSync("resize", size);
	return x;
}

/**
 * Update the UTC time display
 */
function updateUtcTime() {
	const now = new Date();

	const hours = ('0' + now.getUTCHours()).slice(-2);
	const minutes = ('0' + now.getUTCMinutes()).slice(-2);
	const seconds = ('0' + now.getUTCSeconds()).slice(-2);

	const formattedTime = `${hours}:${minutes}:${seconds}z`;

	const utcElement = document.getElementById('utc');
	if (utcElement) {
		utcElement.innerHTML = formattedTime;
	}
}

module.exports = {
	select,
	resizeme,
	updateUtcTime
};
