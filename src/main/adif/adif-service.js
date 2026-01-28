/**
 * ADIF processing service for WaveLogGate
 */

/**
 * Normalize TX power in ADIF data (converts kW/mW to W)
 * @param {string} adifdata - The ADIF string to normalize
 * @returns {string} Normalized ADIF string
 */
function normalizeTxPwr(adifdata) {
	return adifdata.replace(/<TX_PWR:(\d+)>([^<]+)/gi, (match, length, value) => {
		const cleanValue = value.trim().toLowerCase();

		const numMatch = cleanValue.match(/^(\d+(?:\.\d+)?)/);
		if (!numMatch) return match; // not a valid number, return original match

		let watts = parseFloat(numMatch[1]);

		// get the unit if present
		if (cleanValue.includes('kw')) {
			watts *= 1000;
		} else if (cleanValue.includes('mw')) {
			watts *= 0.001;
		}
		// if it's just 'w' we assume it's already in watts

		// get the new length and return the new TX_PWR tag
		const newValue = watts.toString();
		return `<TX_PWR:${newValue.length}>${newValue}`;
	});
}

/**
 * Normalize K Index in ADIF data (round to 0-9 range)
 * @param {string} adifdata - The ADIF string to normalize
 * @returns {string} Normalized ADIF string
 */
function normalizeKIndex(adifdata) {
	return adifdata.replace(/<K_INDEX:(\d+)>([^<]+)/gi, (match, length, value) => {
		const numValue = parseFloat(value.trim());
		if (isNaN(numValue)) return ''; // Remove if not a number

		// Round to nearest integer and clamp to 0-9 range
		let kIndex = Math.round(numValue);
		if (kIndex < 0) kIndex = 0;
		if (kIndex > 9) kIndex = 9;

		return `<K_INDEX:${kIndex.toString().length}>${kIndex}`;
	});
}

/**
 * Manipulate ADIF data with all normalizations
 * @param {string} adifdata - The ADIF string to manipulate
 * @returns {string} Manipulated ADIF string
 */
function manipulateAdifData(adifdata) {
	adifdata = normalizeTxPwr(adifdata);
	adifdata = normalizeKIndex(adifdata);
	// add more manipulation if necessary here
	// ...
	return adifdata;
}

/**
 * Parse ADIF string to object
 * @param {string} adifdata - The ADIF string to parse
 * @returns {Object} Parsed ADIF object
 */
function parseADIF(adifdata) {
	const { ADIF } = require("tcadif");
	const normalizedData = manipulateAdifData(adifdata);
	const adiReader = ADIF.parse(normalizedData);
	return adiReader.toObject();
}

/**
 * Convert ADIF object to ADIF string
 * @param {Object} adifObject - The ADIF object to convert
 * @returns {Object} ADIF writer object
 */
function writeADIF(adifObject) {
	const { ADIF } = require("tcadif");
	const adiWriter = new ADIF(adifObject);
	return adiWriter;
}

/**
 * Convert frequency to band name
 * @param {string} freq_mz - Frequency in MHz
 * @returns {string|null} Band name or null if not found
 */
function freqToBand(freq_mz) {
	const f = parseFloat(freq_mz);
	if (isNaN(f)) return null;

	const bandMap = require('tcadif/lib/enums/Band');
	for (const [band, { lowerFreq, upperFreq }] of Object.entries(bandMap))
		if (f >= parseFloat(lowerFreq) && f <= parseFloat(upperFreq))
			return band;

	return null;
}

module.exports = {
	normalizeTxPwr,
	normalizeKIndex,
	manipulateAdifData,
	parseADIF,
	writeADIF,
	freqToBand
};
