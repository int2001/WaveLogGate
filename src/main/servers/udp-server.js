/**
 * UDP server for WSJT-X log messages
 */

const udp = require('dgram');
const xml = require("xml2js");
const { freqToBand, parseADIF, writeADIF } = require('../adif/adif-service');
const { send2wavelog } = require('../wavelog/wavelog-api');
const { fmt } = require('../utils/date-utils');
const { show_noti } = require('../utils/notifications');

/**
 * Start the UDP server for WSJT-X messages
 * @param {number} port - UDP port to listen on (default 2333)
 * @param {Object} config - Current configuration
 * @param {Function} tomsg - Function to send messages to renderer
 * @param {Object} mainWindow - Main window reference
 * @returns {Object} UDP server instance
 */
function startUdpServer(port = 2333, config, tomsg, mainWindow) {
	const WServer = udp.createSocket('udp4');

	WServer.on('error', function (err) {
		tomsg('Some other Tool blocks Port ' + port + '. Stop it, and restart this');
	});

	WServer.on('message', async function (msg, info) {
		let parsedXML = {};
		let adobject = {};
		if (msg.toString().includes("xml")) {	// detect if incoming String is XML
			try {
				xml.parseString(msg.toString(), function (err, dat) {
					parsedXML = dat;
				});
				let qsodatum = new Date(Date.parse(parsedXML.contactinfo.timestamp[0] + "Z")); // Added Z to make it UTC
				const qsodat = fmt(qsodatum);
				if (parsedXML.contactinfo.mode[0] == 'USB' || parsedXML.contactinfo.mode[0] == 'LSB') {	 // TCADIF lib is not capable of using USB/LSB
					parsedXML.contactinfo.mode[0] = 'SSB';
				}
				adobject = {
					qsos: [
						{
							CALL: parsedXML.contactinfo.call[0],
							MODE: parsedXML.contactinfo.mode[0],
							QSO_DATE_OFF: qsodat.d,
							QSO_DATE: qsodat.d,
							TIME_OFF: qsodat.t,
							TIME_ON: qsodat.t,
							RST_RCVD: parsedXML.contactinfo.rcv[0],
							RST_SENT: parsedXML.contactinfo.snt[0],
							FREQ: ((1 * parseInt(parsedXML.contactinfo.txfreq[0])) / 100000).toString(),
							FREQ_RX: ((1 * parseInt(parsedXML.contactinfo.rxfreq[0])) / 100000).toString(),
							OPERATOR: parsedXML.contactinfo.operator[0],
							COMMENT: parsedXML.contactinfo.comment[0],
							POWER: parsedXML.contactinfo.power[0],
							STX: parsedXML.contactinfo.sntnr[0],
							RTX: parsedXML.contactinfo.rcvnr[0],
							MYCALL: parsedXML.contactinfo.mycall[0],
							GRIDSQUARE: parsedXML.contactinfo.gridsquare[0],
							STATION_CALLSIGN: parsedXML.contactinfo.mycall[0]
						}
					]
				};
				let band = freqToBand(adobject.qsos[0].FREQ);
				if (band) adobject.qsos[0].BAND = band;
			} catch (e) {
				console.error('Error parsing XML:', e);
			}
		} else {
			try {
				adobject = parseADIF(msg.toString());
			} catch (e) {
				tomsg('<div class="alert alert-danger" role="alert">Received broken ADIF</div>');
				return;
			}
		}

		let plainret = '';
		if (adobject.qsos && adobject.qsos.length > 0) {
			let x = {};
			try {
				const outadif = writeADIF(adobject);
				plainret = await send2wavelog(config.profiles[config.profile ?? 0], outadif.stringify());
				x.state = plainret.statusCode;
				x.payload = JSON.parse(plainret.resString);
			} catch (e) {
				try {
					x.payload = JSON.parse(e.resString);
				} catch (ee) {
					x.state = e.statusCode;
					x.payload = {};
					x.payload.string = e.resString;
					x.payload.status = 'bug';
				} finally {
					x.payload.status = 'bug';
				}
			}
			if (x.payload.status == 'created') {
				adobject.created = true;
				show_noti("QSO added: " + adobject.qsos[0].CALL);
			} else {
				adobject.created = false;
				console.log(x);
				adobject.fail = x;
				if (x.payload.messages) {
					adobject.fail.payload.reason = x.payload.messages.join();
				}
				show_noti("QSO NOT added: " + adobject.qsos[0].CALL);
			}
			// Send updateTX to renderer
			if (mainWindow && !mainWindow.isDestroyed()) {
				mainWindow.webContents.send('updateTX', adobject);
			}
			tomsg('');
		} else {
			tomsg('<div class="alert alert-danger" role="alert">No ADIF detected. WSJT-X: Use ONLY Secondary UDP-Server</div>');
		}
	});

	WServer.bind(port);
	return WServer;
}

module.exports = {
	startUdpServer
};
