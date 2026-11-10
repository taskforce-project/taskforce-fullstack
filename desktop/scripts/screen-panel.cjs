// Photographie le panneau de gauche de l'écran de la coque (static/panel.js), rendu par l'Electron de l'app à l'échelle
// d'écran demandée, dans une fenêtre cachée. Lancé par make-screen-panel.mjs, une fois par échelle (l'échelle vaut pour
// tout le processus), avec un dossier de profil jetable que celui-ci efface ensuite.
// Usage : electron scripts/screen-panel.cjs <échelle, ex. 1.25> <sortie.png> <dossier du profil>
const { app, BrowserWindow } = require("electron");
const { writeFileSync } = require("node:fs");
const { join } = require("node:path");

const [scale, out, profile] = process.argv.slice(-3);
app.setPath("userData", profile);
app.commandLine.appendSwitch("force-device-scale-factor", scale);

app.whenReady().then(async () => {
  const window = new BrowserWindow({
    x: 0,
    y: 0,
    width: 1000,
    height: 640,
    show: false,
    frame: false,
    backgroundColor: "#ffffff",
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  // Une fenêtre plus haute que l'écran (640 points à 200 % sur un écran de 1 200 pixels) serait réduite à sa taille.
  window.setBounds({ x: 0, y: 0, width: 1000, height: 640 });
  const [, height] = window.getContentSize();
  if (Math.abs(height - 640) > 1) throw new Error(`the window is ${height} points high, not 640`);
  await window.loadFile(join(__dirname, "..", "static", "splash.html"));
  // Les images décodées avant la photo : la peinture et la capture de l'app.
  await window.webContents.executeJavaScript("Promise.all([...document.images].map((image) => image.decode()))");
  await new Promise((resolve) => setTimeout(resolve, 500));
  const image = await window.webContents.capturePage({ x: 0, y: 0, width: 520, height: 640 }, { stayHidden: true });
  writeFileSync(out, image.toPNG({ scaleFactor: Number(scale) }));
  app.exit(0);
}).catch((error) => {
  console.error(error);
  app.exit(1);
});
