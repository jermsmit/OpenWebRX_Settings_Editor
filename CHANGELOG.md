# Changelog

All notable changes to OpenWebRX Settings Editor are documented here.  
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [1.0.0] — 2025-01-01

### Added
- Initial release
- Pi-hole AdminLTE-style dark web UI
- Dashboard with stat cards (devices, profiles, file size, schema version)
- SDR Device manager — add, edit, delete with full field support
- Profile manager — full OpenWebRX profile field set including `direct_sampling`, squelch, tuning step, modulation
- Global settings editor — receiver info, GPS, waterfall levels, FFT size, max clients
- Import existing `settings.json` via file upload
- Export validated `settings.json` for direct use with OpenWebRX
- Server-side validation with error and warning breakdown
- Raw JSON editor with apply and copy-to-clipboard
- Keyboard shortcuts: `Ctrl+S` export · `Ctrl+O` import · `Esc` close modal
- Bash install script for Debian/Ubuntu/Raspberry Pi OS/Fedora/RHEL
- Systemd service with auto-start on boot
- Automatic firewall rule creation (UFW / firewalld)
- Collapsible sidebar
- Toast notifications for all actions
- Responsive layout for tablet and mobile
