# Asterline

Asterline is a browser-first procedural solar-system logistics game packaged with Electron for Windows.

The product icon is defined in `icon.svg` and is used by the browser build and desktop packaging configuration.

## Run the desktop app

```powershell
npm.cmd install
npm.cmd start
```

## Build a Windows installer

```powershell
npm.cmd run package:win
```

The installer is written to the `release` folder.

## Publish on GitHub

The source project is ready to publish as a GitHub repository. The Windows installer is excluded from normal source commits and can be uploaded as a GitHub Release asset.

```powershell
git init
git add .
git commit -m "Initial Asterline release"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/asterline.git
git push -u origin main
```

After pushing, create a GitHub Release and upload `release\Asterline Setup 0.1.0.exe` so users can download the Windows app.
