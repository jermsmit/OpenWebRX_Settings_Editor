#!/usr/bin/env python3
"""
OpenWebRX Settings Editor
A web-based editor for OpenWebRX settings.json files.
"""

import json
import os
from flask import Flask, render_template, request, jsonify, send_file
from werkzeug.utils import secure_filename
import tempfile

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max upload
app.secret_key = os.environ.get('SECRET_KEY', 'owrx-editor-secret-change-me')

# ── Defaults ────────────────────────────────────────────────────────────────

DEFAULT_SETTINGS = {
    "version": 8,
    "sdrs": {}
}

SDR_TYPES = ["rtl_sdr", "rtl_sdr_soapy", "sdrplay", "hackrf", "airspy",
             "airspyhf", "fifi_sdr", "pluto_sdr", "sigmf", "runds",
             "uhd", "lime_sdr", "radioberry", "xtrx"]

MODULATIONS = ["nfm", "wfm", "am", "lsb", "usb", "cw", "dmr", "dstar",
               "ysf", "nxdn", "m17", "wspr", "js8", "packet", "adsb",
               "ism", "page", "pocsag", "drm", "ssb"]

# ── Routes ───────────────────────────────────────────────────────────────────

@app.route('/')
def index():
    return render_template('index.html',
                           sdr_types=SDR_TYPES,
                           modulations=MODULATIONS)

@app.route('/api/default')
def get_default():
    """Return a blank default settings structure."""
    return jsonify(DEFAULT_SETTINGS)

@app.route('/api/import', methods=['POST'])
def import_settings():
    """Accept uploaded JSON and return parsed settings."""
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400
    f = request.files['file']
    if f.filename == '':
        return jsonify({'error': 'No file selected'}), 400
    try:
        data = json.loads(f.read().decode('utf-8'))
        return jsonify({'success': True, 'settings': data})
    except json.JSONDecodeError as e:
        return jsonify({'error': f'Invalid JSON: {str(e)}'}), 400

@app.route('/api/validate', methods=['POST'])
def validate_settings():
    """Validate a settings object and return warnings/errors."""
    data = request.get_json()
    issues = []
    warnings = []

    if not data:
        return jsonify({'error': 'No data provided'}), 400

    if 'version' not in data:
        issues.append('Missing required field: version')
    if 'sdrs' not in data:
        issues.append('Missing required field: sdrs')
    elif not isinstance(data['sdrs'], dict):
        issues.append('sdrs must be an object')
    else:
        if len(data['sdrs']) == 0:
            warnings.append('No SDR devices defined')
        for sdr_id, sdr in data['sdrs'].items():
            if 'name' not in sdr:
                issues.append(f'SDR "{sdr_id}": missing name')
            if 'type' not in sdr:
                issues.append(f'SDR "{sdr_id}": missing type')
            if 'profiles' not in sdr or len(sdr.get('profiles', {})) == 0:
                warnings.append(f'SDR "{sdr_id}": no profiles defined')
            else:
                for prof_id, prof in sdr['profiles'].items():
                    if 'name' not in prof:
                        issues.append(f'Profile "{prof_id}": missing name')
                    if 'center_freq' not in prof:
                        issues.append(f'Profile "{prof_id}": missing center_freq')
                    if 'samp_rate' not in prof:
                        warnings.append(f'Profile "{prof_id}": missing samp_rate')
                    if 'start_mod' not in prof:
                        warnings.append(f'Profile "{prof_id}": missing start_mod')

    return jsonify({
        'valid': len(issues) == 0,
        'errors': issues,
        'warnings': warnings
    })

@app.route('/api/export', methods=['POST'])
def export_settings():
    """Return settings as a downloadable JSON file."""
    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data provided'}), 400
    try:
        json_str = json.dumps(data, indent=2, ensure_ascii=False)
        tmp = tempfile.NamedTemporaryFile(mode='w', suffix='.json',
                                          delete=False, encoding='utf-8')
        tmp.write(json_str)
        tmp.close()
        return send_file(tmp.name, as_attachment=True,
                         download_name='settings.json',
                         mimetype='application/json')
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/modulations')
def get_modulations():
    return jsonify(MODULATIONS)

@app.route('/api/sdr_types')
def get_sdr_types():
    return jsonify(SDR_TYPES)

# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == '__main__':
    host = os.environ.get('OWRX_HOST', '0.0.0.0')
    port = int(os.environ.get('OWRX_PORT', 5000))
    debug = os.environ.get('OWRX_DEBUG', 'false').lower() == 'true'
    print(f"OpenWebRX Settings Editor running at http://{host}:{port}")
    app.run(host=host, port=port, debug=debug)
