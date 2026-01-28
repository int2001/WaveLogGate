/**
 * Profile management for WaveLogGate
 */

const storage = require('electron-json-storage');

/**
 * Create a new profile
 * @param {string} name - The name for the new profile
 * @param {Object} currentData - Current configuration data
 * @returns {Object} Result with success flag and index
 */
function create_profile(name, currentData) {
	const data = currentData || storage.getSync('basic');

	const newProfile = {
		wavelog_url: data.profiles[data.profile || 0].wavelog_url || '',
		wavelog_key: data.profiles[data.profile || 0].wavelog_key || '',
		wavelog_id: data.profiles[data.profile || 0].wavelog_id || '0',
		wavelog_radioname: 'WLGate',
		wavelog_pmode: true,
		flrig_host: '127.0.0.1',
		flrig_port: '12345',
		flrig_ena: false,
		hamlib_host: '127.0.0.1',
		hamlib_port: '4532',
		hamlib_ena: false,
		ignore_pwr: false
	};

	data.profiles.push(newProfile);
	data.profileNames.push(name || `Profile ${data.profiles.length}`);

	storage.setSync('basic', data);

	return { success: true, index: data.profiles.length - 1 };
}

/**
 * Delete a profile
 * @param {number} index - The profile index to delete
 * @param {Object} currentData - Current configuration data
 * @returns {Object} Result with success flag and optional error
 */
function delete_profile(index, currentData) {
	const data = currentData || storage.getSync('basic');

	// Prevent deleting if only 2 profiles remain
	if (data.profiles.length <= 2) {
		return { success: false, error: 'Minimum 2 profiles required' };
	}

	// Prevent deleting active profile
	if ((data.profile || 0) === index) {
		return { success: false, error: 'Cannot delete active profile' };
	}

	data.profiles.splice(index, 1);
	data.profileNames.splice(index, 1);

	// Adjust active index if needed
	if ((data.profile || 0) > index) {
		data.profile = (data.profile || 0) - 1;
	}

	storage.setSync('basic', data);

	return { success: true };
}

/**
 * Rename a profile
 * @param {number} index - The profile index to rename
 * @param {string} newName - The new name for the profile
 * @param {Object} currentData - Current configuration data
 * @returns {Object} Result with success flag
 */
function rename_profile(index, newName, currentData) {
	const data = currentData || storage.getSync('basic');
	data.profileNames[index] = newName;

	storage.setSync('basic', data);

	return { success: true };
}

/**
 * Switch to a different profile
 * @param {number} index - The profile index to switch to
 * @param {Object} currentData - Current configuration data
 * @returns {Object} Result with success flag
 */
function switch_profile(index, currentData) {
	const data = currentData || storage.getSync('basic');
	data.profile = index;

	storage.setSync('basic', data);

	return { success: true };
}

module.exports = {
	create_profile,
	delete_profile,
	rename_profile,
	switch_profile
};
