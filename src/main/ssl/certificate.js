/**
 * SSL certificate management for WaveLogGate
 * Generates and manages self-signed certificates for HTTPS/WSS
 */

const forge = require('node-forge');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const crypto = require('crypto');

/**
 * Setup SSL certificates (generate or load existing)
 * @param {Object} app - Electron app instance
 * @returns {Object} Result with success flag and cert paths
 */
function setupCertificates(app) {
	const userDataPath = app.getPath('userData');
	const certDir = path.join(userDataPath, 'certs');

	// Check if certificates already exist
	const keyPath = path.join(certDir, 'server.key');
	const certPath = path.join(certDir, 'server.crt');

	if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
		// Load existing certificates
		const certPaths = {
			key: fs.readFileSync(keyPath),
			cert: fs.readFileSync(certPath)
		};
		console.log('Using existing SSL certificates');
		return { success: true, newlyGenerated: false, certPaths };
	}

	// Generate new certificates
	try {
		// Create cert directory if it doesn't exist
		if (!fs.existsSync(certDir)) {
			fs.mkdirSync(certDir, { recursive: true });
		}

		// Generate RSA key pair
		const keys = forge.pki.rsa.generateKeyPair(2048);

		// Create certificate
		const cert = forge.pki.createCertificate();
		cert.publicKey = keys.publicKey;
		cert.serialNumber = '01';
		cert.validity.notBefore = new Date();
		cert.validity.notAfter = new Date();
		cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 10); // 10 years

		// Set subject and issuer (self-signed)
		const attrs = [{
			name: 'commonName',
			value: '127.0.0.1'
		}];
		cert.setSubject(attrs);
		cert.setIssuer(attrs);

		// Add extensions including SANs
		cert.setExtensions([{
			name: 'basicConstraints',
			cA: false
		}, {
			name: 'keyUsage',
			digitalSignature: true,
			keyEncipherment: true
		}, {
			name: 'extKeyUsage',
			serverAuth: true,
			clientAuth: true
		}, {
			name: 'subjectAltName',
			altNames: [{
				type: 7, // IP address
				ip: '127.0.0.1'
			}, {
				type: 2, // DNS name
				value: 'localhost'
			}, {
				type: 7, // IPv6 address
				ip: '::1'
			}]
		}]);

		// Self-sign the certificate
		cert.sign(keys.privateKey, forge.md.sha256.create());

		// Convert to PEM format
		const certPem = forge.pki.certificateToPem(cert);
		const keyPem = forge.pki.privateKeyToPem(keys.privateKey);

		// Save certificates
		fs.writeFileSync(keyPath, keyPem);
		fs.writeFileSync(certPath, certPem);

		const certPaths = {
			key: keyPem,
			cert: certPem
		};

		console.log('Generated new SSL certificates');
		return { success: true, newlyGenerated: true, certPaths };
	} catch (error) {
		console.error('Failed to generate certificates:', error);
		return { success: false, newlyGenerated: false, certPaths: null };
	}
}

/**
 * Get the CA certificate for display/installation
 * @param {Object} app - Electron app instance
 * @returns {string|null} Certificate content or null
 */
function getCaCertificate(app) {
	const userDataPath = app.getPath('userData');
	const certPath = path.join(userDataPath, 'certs', 'server.crt');

	if (fs.existsSync(certPath)) {
		return fs.readFileSync(certPath, 'utf8');
	}
	return null;
}

/**
 * Check if certificate is installed in system trust store
 * @param {Object} app - Electron app instance
 * @returns {boolean} True if installed
 */
function isCertificateInstalled(app) {
	const userDataPath = app.getPath('userData');
	const certPath = path.join(userDataPath, 'certs', 'server.crt');

	if (!fs.existsSync(certPath)) {
		return false;
	}

	const platform = process.platform;

	try {
		if (platform === 'win32') {
			// Windows: Check if cert exists in Root store
			try {
				const output = execSync('certutil -store Root', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
				// Check for our certificate's common name (127.0.0.1)
				return output.includes('CN=127.0.0.1') || output.includes('127.0.0.1');
			} catch (err) {
				console.log('Failed to check Windows certificate store:', err.message);
				return false;
			}
		} else if (platform === 'darwin') {
			// macOS: Check if cert exists in System keychain
			try {
				execSync('security find-certificate -c "127.0.0.1" -p /Library/Keychains/System.keychain', { stdio: 'ignore' });
				return true;
			} catch (err) {
				// Also check user keychain as fallback
				try {
					execSync('security find-certificate -c "127.0.0.1" -p ~/Library/Keychains/login.keychain-db', { stdio: 'ignore' });
					return true;
				} catch (userErr) {
					return false;
				}
			}
		} else if (platform === 'linux') {
			// Linux: Check if cert exists in system ca-certificates directories
			const certContent = fs.readFileSync(certPath, 'utf8');
			// Calculate a simple hash of the certificate content
			const certHash = crypto.createHash('sha256').update(certContent).digest('hex');

			// Check Debian/Ubuntu location
			const debPath = '/usr/local/share/ca-certificates/waveloggate.crt';
			if (fs.existsSync(debPath)) {
				const existingContent = fs.readFileSync(debPath, 'utf8');
				const existingHash = crypto.createHash('sha256').update(existingContent).digest('hex');
				if (certHash === existingHash) return true;
			}

			// Check Fedora/RHEL location
			const rhelPath = '/etc/pki/ca-trust/source/anchors/waveloggate.crt';
			if (fs.existsSync(rhelPath)) {
				const existingContent = fs.readFileSync(rhelPath, 'utf8');
				const existingHash = crypto.createHash('sha256').update(existingContent).digest('hex');
				if (certHash === existingHash) return true;
			}

			// Check Arch Linux location
			const archPath = '/etc/ca-certificates/trust-source/anchors/waveloggate.crt';
			if (fs.existsSync(archPath)) {
				const existingContent = fs.readFileSync(archPath, 'utf8');
				const existingHash = crypto.createHash('sha256').update(existingContent).digest('hex');
				if (certHash === existingHash) return true;
			}

			return false;
		}

		// Unknown platform - assume not installed
		return false;
	} catch (error) {
		console.log('Error checking certificate installation:', error.message);
		return false;
	}
}

/**
 * Install certificate in system trust store
 * @param {Object} app - Electron app instance
 * @returns {Promise<Object>} Result with success flag and message
 */
async function installCertificate(app) {
	const userDataPath = app.getPath('userData');
	const certPath = path.join(userDataPath, 'certs', 'server.crt');

	if (!fs.existsSync(certPath)) {
		return {
			success: false,
			message: 'Certificate not found. Please restart the application to generate it.',
			manual: false
		};
	}

	const platform = process.platform;

	try {
		if (platform === 'darwin') {
			// macOS - Use AppleScript to run with admin privileges
			try {
				const escapedCertPath = certPath.replace(/'/g, "'\\''");

				const appleScript = `
					do shell script "security add-trusted-cert -d -p ssl -p basic -k /Library/Keychains/System.keychain '${escapedCertPath}'" with administrator privileges
				`;

				execSync(`osascript -e '${appleScript.replace(/'/g, "'\\''")}'`, { stdio: 'ignore' });
				console.log('Certificate installed in System keychain via AppleScript');
				return {
					success: true,
					message: 'Certificate installed in System keychain. Chrome and Safari should now trust it after restart.',
					manual: false
				};
			} catch (sysError) {
				console.log('AppleScript installation failed:', sysError.message);
				return {
					success: false,
					message: `Installation was cancelled or failed.\n\nPlease try again and enter your macOS password when prompted.\n\nIf you prefer manual installation, run this command in Terminal:\n\nsudo security add-trusted-cert -d -p ssl -p basic -k /Library/Keychains/System.keychain "${certPath}"`,
					manual: true,
					command: `sudo security add-trusted-cert -d -p ssl -p basic -k /Library/Keychains/System.keychain "${certPath}"`
				};
			}
		} else if (platform === 'win32') {
			// Windows - try to install with elevation prompt
			try {
				execSync(`certutil -addstore -f Root "${certPath}"`, { stdio: 'ignore' });
				console.log('Certificate installed in Windows trust store');
				return {
					success: true,
					message: 'Certificate installed in Windows trust store.',
					manual: false
				};
			} catch (winError) {
				// Not running as admin - try PowerShell elevation
				try {
					const psScript = `Start-Process powershell -ArgumentList '-Command', 'certutil -addstore -f Root \\"${certPath}\\"' -Verb RunAs`;
					execSync(`powershell -Command "${psScript}"`, { stdio: 'ignore' });
					await new Promise(resolve => setTimeout(resolve, 2000));
					return {
						success: true,
						message: 'Certificate installation prompt shown. Please approve the UAC prompt and restart your browser.',
						manual: false
					};
				} catch (elevateError) {
					return {
						success: false,
						message: `Installation requires Administrator privileges. Please run PowerShell as Administrator and execute:\n\ncertutil -addstore -f Root "${certPath}"`,
						manual: true,
						command: `certutil -addstore -f Root "${certPath}"`
					};
				}
			}
		} else if (platform === 'linux') {
			// Linux - try pkexec for GUI systems
			try {
				const distroInfo = getLinuxDistro();

				// Try Debian/Ubuntu approach first
				if (fs.existsSync('/usr/local/share/ca-certificates/')) {
					const installScript = `cp "${certPath}" /usr/local/share/ca-certificates/waveloggate.crt && update-ca-certificates`;
					execSync(`pkexec sh -c '${installScript}'`, { stdio: 'ignore' });
					return {
						success: true,
						message: 'Certificate installed. Please restart your browser.',
						manual: false
					};
				}
				// Try Fedora/RHEL approach
				else if (fs.existsSync('/etc/pki/ca-trust/source/anchors/')) {
					const installScript = `cp "${certPath}" /etc/pki/ca-trust/source/anchors/waveloggate.crt && update-ca-trust`;
					execSync(`pkexec sh -c '${installScript}'`, { stdio: 'ignore' });
					return {
						success: true,
						message: 'Certificate installed. Please restart your browser.',
						manual: false
					};
				}
				// Try Arch Linux approach
				else if (fs.existsSync('/etc/ca-certificates/trust-source/anchors/')) {
					const installScript = `cp "${certPath}" /etc/ca-certificates/trust-source/anchors/waveloggate.crt && update-ca-trust`;
					execSync(`pkexec sh -c '${installScript}'`, { stdio: 'ignore' });
					return {
						success: true,
						message: 'Certificate installed. Please restart your browser.',
						manual: false
					};
				} else {
					throw new Error('Unknown certificate location');
				}
			} catch (linuxError) {
				return {
					success: false,
					message: `Automatic installation failed. Please run these commands in Terminal:\n\nDebian/Ubuntu:\nsudo cp "${certPath}" /usr/local/share/ca-certificates/waveloggate.crt\nsudo update-ca-certificates\n\nFedora/RHEL:\nsudo cp "${certPath}" /etc/pki/ca-trust/source/anchors/waveloggate.crt\nsudo update-ca-trust\n\nArch Linux:\nsudo cp "${certPath}" /etc/ca-certificates/trust-source/anchors/waveloggate.crt\nsudo update-ca-trust`,
					manual: true
				};
			}
		}

		return {
			success: false,
			message: 'Unsupported platform for automatic certificate installation.',
			manual: true
		};
	} catch (error) {
		console.error('Certificate installation error:', error);
		return {
			success: false,
			message: `Installation failed: ${error.message}`,
			manual: true
		};
	}
}

/**
 * Get Linux distribution name
 * @returns {string} Distribution ID or 'unknown'
 */
function getLinuxDistro() {
	try {
		if (fs.existsSync('/etc/os-release')) {
			const osRelease = fs.readFileSync('/etc/os-release', 'utf8');
			const match = osRelease.match(/ID=([^\n]+)/);
			if (match) return match[1];
		}
	} catch (e) {
		// Ignore
	}
	return 'unknown';
}

module.exports = {
	setupCertificates,
	getCaCertificate,
	isCertificateInstalled,
	installCertificate,
	getLinuxDistro
};
