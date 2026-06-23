import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { app, BrowserWindow, Menu, Tray, nativeImage, session, shell } from 'electron'

import { setupDataDir } from './paths'
import { startEmbeddedServer } from './server-bootstrap'

app.disableHardwareAcceleration()

const isDev = process.env.AGENTHUB_DEV === '1'
const DEV_URL = process.env.AGENTHUB_DEV_URL ?? 'http://localhost:3000'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false

app.setName('AgentHub')

function resolveTrayIconPath(): string | null {
  const candidates = [
    join(app.getAppPath(), 'electron', 'tray-icon.png'),
    join(process.cwd(), 'electron', 'tray-icon.png'),
  ]

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }

  return null
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const wins = BrowserWindow.getAllWindows()
    if (wins.length > 0) {
      const window = wins[0]
      if (window.isMinimized()) window.restore()
      window.show()
      window.focus()
    }
  })

  setupDataDir()

  app.whenReady().then(async () => {
    await session.defaultSession
      .setProxy({ proxyRules: 'direct://', proxyBypassRules: '<local>' })
      .catch((err) => console.error('[AgentHub] setProxy failed', err))

    let url: string
    try {
      url = isDev ? DEV_URL : `http://127.0.0.1:${await startEmbeddedServer()}`
    } catch (err) {
      console.error('[AgentHub] failed to start server', err)
      app.quit()
      return
    }

    mainWindow = new BrowserWindow({
      width: 1280,
      height: 900,
      minWidth: 980,
      minHeight: 700,
      title: 'AgentHub',
      backgroundColor: '#f8f9fa',
      show: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        devTools: !app.isPackaged,
      },
    })

    const revealWindow = () => {
      if (!mainWindow) return
      if (mainWindow.isMinimized()) mainWindow.restore()
      if (!mainWindow.isVisible()) mainWindow.show()
      mainWindow.focus()
    }

    const hideWindow = () => {
      if (!mainWindow) return
      mainWindow.hide()
    }

    const trayIconPath = resolveTrayIconPath()
    const trayIcon = trayIconPath ? nativeImage.createFromPath(trayIconPath) : nativeImage.createEmpty()
    if (trayIcon.isEmpty()) {
      console.warn('[AgentHub] tray icon image is empty')
    }

    tray = new Tray(trayIcon)
    tray.setImage(trayIcon)
    tray.setToolTip('AgentHub')
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Show AgentHub', click: revealWindow },
        { type: 'separator' },
        {
          label: 'Quit AgentHub',
          click: () => app.quit(),
        },
      ]),
    )
    tray.on('click', revealWindow)

    mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
      shell.openExternal(target).catch(() => {})
      return { action: 'deny' }
    })

    mainWindow.webContents.on('will-navigate', (event, target) => {
      const origin = new URL(target).origin
      if (origin !== new URL(url).origin) {
        event.preventDefault()
        shell.openExternal(target).catch(() => {})
      }
    })

    mainWindow.once('ready-to-show', revealWindow)
    mainWindow.webContents.once('did-finish-load', revealWindow)
    mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
      console.error('[AgentHub] failed to load', { errorCode, errorDescription, validatedURL })
      revealWindow()
    })
    setTimeout(revealWindow, 5000)

    mainWindow.on('close', (event) => {
      if (isQuitting) return
      if (tray) {
        event.preventDefault()
        hideWindow()
      }
    })

    mainWindow.on('closed', () => {
      mainWindow = null
    })

    try {
      await mainWindow.loadURL(url)
    } catch (err) {
      console.error('[AgentHub] loadURL failed', err)
    } finally {
      revealWindow()
    }
  })

  app.on('before-quit', () => {
    isQuitting = true
    tray?.destroy()
    tray = null
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })
}
