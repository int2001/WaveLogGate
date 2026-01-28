/**
 * Profile manager for WaveLogGate renderer
 * Handles profile CRUD operations
 */

const { ipcRenderer } = require('electron');
// jQuery is loaded globally in index.html

// Global variable for selected profile index
let selectedProfileIndex = null;

/**
 * Get the selected profile index
 * @returns {number|null} Selected profile index
 */
function getSelectedProfileIndex() {
	return selectedProfileIndex;
}

/**
 * Set the selected profile index
 * @param {number} index - Profile index to select
 */
function setSelectedProfileIndex(index) {
	selectedProfileIndex = index;
}

/**
 * Open the profile manager modal
 * @param {Object} cfg - Configuration object
 * @returns {number} Selected profile index
 */
function openProfileManager(cfg) {
	selectedProfileIndex = cfg.profile || 0;
	renderProfileList(cfg);
	$('#profileModal').modal('show');
	return selectedProfileIndex;
}

/**
 * Render the profile list in the modal
 * @param {Object} cfg - Configuration object
 */
function renderProfileList(cfg) {
	const listEl = $('#profileList');
	listEl.empty();

	cfg.profiles.forEach((profile, index) => {
		const isActive = index === (cfg.profile || 0);
		const name = cfg.profileNames?.[index] || `Profile ${index + 1}`;

		const item = $(`
			<div class="list-group-item" data-index="${index}">
				<div class="d-flex align-items-center">
					<input type="radio" name="profileSelect" value="${index}"
						   ${index === selectedProfileIndex ? 'checked' : ''}>
					<span class="ml-2 profile-name">${name}</span>
					${isActive ? '<span class="badge badge-success ml-2">Active</span>' : ''}
					<div class="ml-auto">
						<button class="btn btn-sm btn-outline-secondary btn-rename">Rename</button>
						<button class="btn btn-sm btn-outline-danger btn-delete"
								${isActive || cfg.profiles.length <= 2 ? 'disabled' : ''}>
							Delete
						</button>
					</div>
				</div>
			</div>
		`);

		listEl.append(item);
	});
}

/**
 * Create a new profile
 * @returns {Promise<Object>} Result object
 */
async function createProfile() {
	const name = $('#newProfileName').val().trim();
	if (!name) {
		alert('Please enter a profile name');
		return { success: false };
	}

	const result = ipcRenderer.sendSync('create_profile', name);
	if (result.success) {
		$('#newProfileName').val('');
	}
	return result;
}

/**
 * Delete a profile
 * @param {number} index - Profile index to delete
 * @param {Object} cfg - Configuration object
 * @returns {Promise<Object>} Result object
 */
async function deleteProfile(index, cfg) {
	const name = cfg.profileNames?.[index] || `Profile ${index + 1}`;
	if (!confirm(`Delete "${name}"?`)) return { success: false };

	const result = ipcRenderer.sendSync('delete_profile', index);
	return result;
}

/**
 * Rename a profile
 * @param {number} index - Profile index to rename
 * @param {Object} cfg - Configuration object
 * @returns {Promise<string|null>} New name or null
 */
async function renameProfile(index, cfg) {
	const currentName = cfg.profileNames?.[index] || `Profile ${index + 1}`;

	// Use a simple Bootstrap prompt via the modal
	const newName = await showRenamePrompt(currentName);

	if (newName && newName.trim() && newName !== currentName) {
		ipcRenderer.sendSync('rename_profile', index, newName.trim());
		return newName;
	}
	return null;
}

/**
 * Show rename prompt modal
 * @param {string} currentName - Current profile name
 * @returns {Promise<string|null>} New name or null if cancelled
 */
function showRenamePrompt(currentName) {
	return new Promise((resolve) => {
		// Create a simple Bootstrap modal for input
		const modalHtml = `
			<div class="modal fade" id="renameModal" tabindex="-1">
				<div class="modal-dialog">
					<div class="modal-content">
						<div class="modal-header">
							<h5 class="modal-title">Rename Profile</h5>
							<button type="button" class="close" data-dismiss="modal">
								<span>&times;</span>
							</button>
						</div>
						<div class="modal-body">
							<input type="text" class="form-control" id="renameInput" value="${currentName}">
						</div>
						<div class="modal-footer">
							<button type="button" class="btn btn-secondary" data-dismiss="modal" id="renameCancel">Cancel</button>
							<button type="button" class="btn btn-primary" id="renameOk">OK</button>
						</div>
					</div>
				</div>
			</div>
		`;

		// Remove any existing rename modal
		$('#renameModal').remove();

		// Add the new modal
		$('body').append(modalHtml);

		const $modal = $('#renameModal');
		const $input = $('#renameInput');

		// Handle OK button
		$('#renameOk').click(() => {
			$modal.modal('hide');
			resolve($input.val());
		});

		// Handle Cancel button and X button
		$('#renameCancel, #renameModal .close').click(() => {
			$modal.modal('hide');
			resolve(null);
		});

		// Handle Enter key
		$input.keypress((e) => {
			if (e.which === 13) {
				$modal.modal('hide');
				resolve($input.val());
			}
		});

		// Handle modal hidden event
		$modal.on('hidden.bs.modal', () => {
			$('#renameModal').remove();
		});

		// Show the modal
		$modal.modal('show');
		$input.focus().select();
	});
}

/**
 * Switch to selected profile
 * @param {number} selectedProfileIndex - Index of profile to switch to
 * @param {Object} cfg - Configuration object
 * @returns {Promise<Object>} Result object
 */
async function switchToSelectedProfile(selectedProfileIndex, cfg) {
	if (selectedProfileIndex === null || selectedProfileIndex === (cfg.profile || 0)) {
		$('#profileModal').modal('hide');
		return { success: false, reason: 'No change' };
	}

	ipcRenderer.sendSync('switch_profile', selectedProfileIndex);
	return { success: true };
}

module.exports = {
	openProfileManager,
	renderProfileList,
	createProfile,
	deleteProfile,
	renameProfile,
	showRenamePrompt,
	switchToSelectedProfile,
	getSelectedProfileIndex,
	setSelectedProfileIndex
};
