const { Tray, Menu, app, shell, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

class SystemTrayManager {
  constructor(server, port) {
    this.server = server;
    this.port = port;
    this.tray = null;
    this.isQuitting = false;
    
    // Prevent app from quitting when window is closed
    app.on('before-quit', () => {
      this.isQuitting = true;
    });
    
    // Initialize when electron is ready
    app.whenReady().then(() => {
      this.createTray();
    });
  }
  
  createTray() {
    // Create tray icon
    const iconPath = path.join(__dirname, '..', 'public', 'icon.png');
    let trayIcon;
    
    if (fs.existsSync(iconPath)) {
      trayIcon = nativeImage.createFromPath(iconPath);
    } else {
      // Fallback to a simple icon if the file doesn't exist
      console.warn('Tray icon not found at:', iconPath);
      // On Windows, we can use an empty icon
      trayIcon = nativeImage.createEmpty();
    }
    
    this.tray = new Tray(trayIcon);
    this.tray.setToolTip('ContextCypher Server');
    
    this.updateMenu();
    
    // Handle double-click to open browser
    this.tray.on('double-click', () => {
      this.openBrowser();
    });
  }
  
  updateMenu() {
    const contextMenu = Menu.buildFromTemplate([
      {
        label: `ContextCypher (Port ${this.port})`,
        enabled: false
      },
      {
        type: 'separator'
      },
      {
        label: 'Open in Browser',
        click: () => this.openBrowser()
      },
      {
        label: 'Server Status',
        submenu: [
          {
            label: `Running on port ${this.port}`,
            enabled: false
          },
          {
            label: 'View Logs',
            click: () => this.openLogs()
          }
        ]
      },
      {
        type: 'separator'
      },
      {
        label: 'Restart Server',
        click: () => this.restartServer()
      },
      {
        label: 'Stop Server',
        click: () => this.stopServer()
      },
      {
        type: 'separator'
      },
      {
        label: 'Exit',
        click: () => this.quit()
      }
    ]);
    
    this.tray.setContextMenu(contextMenu);
  }
  
  openBrowser() {
    const url = `http://localhost:${this.port}`;
    shell.openExternal(url);
  }
  
  openLogs() {
    const logPath = path.join(__dirname, '..', 'logs');
    if (fs.existsSync(logPath)) {
      shell.openPath(logPath);
    } else {
      console.log('Log directory not found:', logPath);
    }
  }
  
  restartServer() {
    console.log('Restarting server...');
    // Emit restart event that the main server can handle
    if (this.server && this.server.emit) {
      this.server.emit('restart-requested');
    }
  }
  
  stopServer() {
    console.log('Stopping server...');
    if (this.server && this.server.close) {
      this.server.close(() => {
        console.log('Server stopped');
        this.updateMenu();
      });
    }
  }
  
  quit() {
    this.isQuitting = true;
    if (this.tray) {
      this.tray.destroy();
    }
    if (this.server && this.server.close) {
      this.server.close(() => {
        app.quit();
      });
    } else {
      app.quit();
    }
  }
  
  showBalloon(title, content) {
    if (this.tray && process.platform === 'win32') {
      this.tray.displayBalloon({
        title: title,
        content: content,
        icon: this.tray.image
      });
    }
  }
}

// Alternative implementation using node-systray for non-Electron environments
class SimpleTrayManager {
  constructor(server, port) {
    this.server = server;
    this.port = port;
    
    try {
      const SysTray = require('systray2').SysTray;
      this.systray = new SysTray({
        menu: {
          icon: path.join(__dirname, '..', 'public', 'icon.ico'),
          isTemplateIcon: false,
          title: 'ContextCypher',
          tooltip: `ContextCypher Server (Port ${port})`,
          items: [
            {
              title: 'Open in Browser',
              tooltip: 'Open ContextCypher in your default browser',
              checked: false,
              enabled: true,
              click: () => {
                require('child_process').exec(
                  process.platform === 'win32' 
                    ? `start http://localhost:${this.port}`
                    : `open http://localhost:${this.port}`
                );
              }
            },
            {
              title: 'Separator',
              tooltip: '',
              checked: false,
              enabled: true
            },
            {
              title: 'Exit',
              tooltip: 'Stop server and exit',
              checked: false,
              enabled: true,
              click: () => {
                this.quit();
              }
            }
          ]
        }
      });
      
      console.log('System tray initialized with systray2');
    } catch (error) {
      console.warn('Could not initialize system tray:', error.message);
    }
  }
  
  quit() {
    if (this.systray) {
      this.systray.kill();
    }
    if (this.server && this.server.close) {
      this.server.close(() => {
        process.exit(0);
      });
    } else {
      process.exit(0);
    }
  }
  
  showBalloon(title, content) {
    // Not supported in systray2
    console.log(`[Notification] ${title}: ${content}`);
  }
}

module.exports = {
  SystemTrayManager,
  SimpleTrayManager
};