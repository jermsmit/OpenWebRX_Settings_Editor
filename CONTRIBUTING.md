# Contributing

Thank you for your interest in contributing to **OpenWebRX Settings Editor**!

## How to contribute

1. **Fork** the repository on GitHub
2. **Clone** your fork locally
3. **Create a branch** for your change: `git checkout -b feature/your-feature-name`
4. **Make your changes** and test locally (see Development Setup below)
5. **Commit** with a clear message: `git commit -m "Add: description of change"`
6. **Push** to your fork: `git push origin feature/your-feature-name`
7. Open a **Pull Request** against `main`

## Development setup

```bash
git clone https://github.com/jermsmit/OpenWebRX_Settings_Editor
cd OpenWebRX_Settings_Editor
python3 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

Open `http://localhost:5000` in your browser.

## What to contribute

- Bug reports and fixes
- New OpenWebRX field support as the schema evolves
- UI improvements
- Additional SDR device type presets
- Translations / i18n
- Documentation improvements or additional screenshots

## Code style

- Python: follow PEP 8, keep functions small and focused
- JavaScript: vanilla JS only, no framework dependencies
- CSS: use the existing CSS variable system — don't hardcode colors

## Reporting bugs

Open a GitHub Issue with:
- OS and Python version
- Steps to reproduce
- Expected vs actual behaviour
- Any error output from `journalctl -u owrx-editor -f`
