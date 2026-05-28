package adif

import (
	"encoding/xml"
	"fmt"
	"strconv"
	"strings"
	"time"
)

// ContactInfo mirrors the <contactinfo> XML format sent by FLDigi and N1MM Logger+.
type ContactInfo struct {
	XMLName     xml.Name `xml:"contactinfo"`
	Call        string   `xml:"call"`
	Mode        string   `xml:"mode"`
	Timestamp   string   `xml:"timestamp"`
	TxFreq      string   `xml:"txfreq"`
	RxFreq      string   `xml:"rxfreq"`
	Rcv         string   `xml:"rcv"`
	Snt         string   `xml:"snt"`
	Power       string   `xml:"power"`
	Operator    string   `xml:"operator"`
	Comment     string   `xml:"comment"`
	SntNr       string   `xml:"sntnr"`
	RcvNr       string   `xml:"rcvnr"`
	MyCall      string   `xml:"mycall"`
	GridSquare  string   `xml:"gridsquare"`
	ContestName string   `xml:"contestname"` // N1MM only; used to detect N1MM source and contest mode
}

var tsFormats = []string{
	"2006-01-02T15:04:05Z",
	"2006-01-02T15:04:05",
	"2006-01-02 15:04:05",
	"2006-01-02T15:04:05.000Z",
	"2006-01-02T15:04:05.000",
}

func parseTimestamp(ts string) time.Time {
	// Force UTC by appending Z if not present.
	s := strings.TrimSpace(ts)
	// N1MM may emit timestamps with a space before a colon (e.g. "16 :43:38").
	s = strings.ReplaceAll(s, " :", ":")
	for _, f := range tsFormats {
		if t, err := time.Parse(f, s); err == nil {
			return t.UTC()
		}
	}
	return time.Now().UTC()
}

// hzToMHz converts a frequency string in Hz to MHz.
// N1MM Logger+ sends frequencies in units of 10 Hz (e.g. 1420000 = 14.200 MHz),
// so set n1mm=true to apply the extra ×10 factor.
func hzToMHz(hzStr string, n1mm bool) string {
	hzStr = strings.TrimSpace(hzStr)
	hz, err := strconv.ParseFloat(hzStr, 64)
	if err != nil {
		return hzStr
	}
	if n1mm {
		hz *= 10
	}
	mhz := hz / 1_000_000.0
	return fmt.Sprintf("%.6f", mhz)
}

// DetectXMLRoot returns the lowercase root element name of an XML document,
// skipping the XML declaration. Returns "" if no element is found.
func DetectXMLRoot(data string) string {
	dec := xml.NewDecoder(strings.NewReader(data))
	for {
		tok, err := dec.Token()
		if err != nil {
			return ""
		}
		if se, ok := tok.(xml.StartElement); ok {
			return strings.ToLower(se.Name.Local)
		}
	}
}

// ParseXML decodes a FLDigi / N1MM Logger+ <contactinfo> XML string into a normalised ADIF field map.
func ParseXML(data string) (map[string]string, error) {
	var ci ContactInfo
	if err := xml.Unmarshal([]byte(data), &ci); err != nil {
		return nil, err
	}

	// N1MM Logger+ is identified by the presence of <contestname>.
	// It sends frequencies in units of 10 Hz; FLDigi sends plain Hz.
	// N1MM uses "DX" as its generic non-contest mode; any other name means contest operation.
	isN1MM := ci.ContestName != ""
	isContest := isN1MM && ci.ContestName != "DX"

	t := parseTimestamp(ci.Timestamp)
	date := t.Format("20060102")
	timeOn := t.Format("150405")

	mode := normalizeMode(ci.Mode)

	freq := hzToMHz(ci.TxFreq, isN1MM)
	freqRx := hzToMHz(ci.RxFreq, isN1MM)

	mhz, _ := strconv.ParseFloat(freq, 64)
	band := FreqToBand(mhz)

	fields := map[string]string{
		"CALL":             ci.Call,
		"MODE":             mode,
		"QSO_DATE":         date,
		"QSO_DATE_OFF":     date,
		"TIME_ON":          timeOn,
		"TIME_OFF":         timeOn,
		"RST_RCVD":         ci.Rcv,
		"RST_SENT":         ci.Snt,
		"FREQ":             freq,
		"FREQ_RX":          freqRx,
		"OPERATOR":         ci.Operator,
		"MYCALL":           ci.MyCall,
		"GRIDSQUARE":       ci.GridSquare,
		"STATION_CALLSIGN": ci.MyCall,
		"BAND":             band,
	}

	// N1MM's power field = received power from the other station, not TX power.
	// Map to comment for N1MM, TX_PWR for FLDigi.
	if ci.Power != "" {
		if isN1MM {
			pwrComment := "[RCVD PWR: " + ci.Power + "]"
			if ci.Comment != "" {
				fields["COMMENT"] = ci.Comment + " " + pwrComment
			} else {
				fields["COMMENT"] = pwrComment
			}
		} else {
			fields["TX_PWR"] = ci.Power
		}
	} else {
		fields["COMMENT"] = ci.Comment
	}

	// Serial numbers and contest ID are only meaningful in contest operation.
	if isContest {
		fields["CONTEST_ID"] = ci.ContestName
		fields["STX"] = ci.SntNr
		if ci.RcvNr != "0" {
			fields["SRX"] = ci.RcvNr
		}
	}

	// Remove empty fields.
	for k, v := range fields {
		if v == "" {
			delete(fields, k)
		}
	}

	return fields, nil
}

// n1mmModeMap normalises N1MM-specific mode names to ADIF-standard equivalents.
var n1mmModeMap = map[string]string{
	"USB":    "SSB",
	"LSB":    "SSB",
	"FMHELL": "HELL",
	"HELL80": "HELL",
}

func normalizeMode(mode string) string {
	if m, ok := n1mmModeMap[mode]; ok {
		return m
	}
	return mode
}
