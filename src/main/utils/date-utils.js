/**
 * Date utility functions for ADIF formatting
 */

/**
 * Format a date to ADIF format (YYYYMMDD, HHMMSS)
 * @param {Date} spotDate - The date to format
 * @returns {Object} Object with d (date) and t (time) properties
 */
function fmt(spotDate) {
	const retstr = {};
	const d = spotDate.getUTCDate().toString();
	const y = spotDate.getUTCFullYear().toString();
	const m = (1 + spotDate.getUTCMonth()).toString();
	const h = spotDate.getUTCHours().toString();
	const i = spotDate.getUTCMinutes().toString();
	const s = spotDate.getUTCSeconds().toString();
	retstr.d = y.padStart(4, '0') + m.padStart(2, '0') + d.padStart(2, '0');
	retstr.t = h.padStart(2, '0') + i.padStart(2, '0') + s.padStart(2, '0');
	return retstr;
}

module.exports = {
	fmt
};
