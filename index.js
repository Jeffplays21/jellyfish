
const { app, BrowserWindow, dialog, ipcMain } = require('electron')
const fs = require("fs")
const path = require("path")
const homedir = require('os').homedir();
const child_process = require('child_process')
const fetch = require("node-fetch")
const url = require('url');


const JELLYFISH_DATA_DIR = path.join(homedir,"Documents","Jellyfish")
global.JELLYFISH_DATA_DIR = JELLYFISH_DATA_DIR

var supportedExploits = ["fluxus"]
if (process.platform == "win32") {
    supportedExploits.push("synx","sirhurt","wrd","easyexploits")
}
if (process.platform == "darwin") {
    supportedExploits.push("calamari")
}
var udr = app.getPath('userData')
if (!fs.existsSync(udr)) {fs.mkdirSync(udr)}
function getPreferedExploit() {
    try {
        if (fs.existsSync(path.join(udr,"preferedExploit.txt"))) {
            var fc = fs.readFileSync(path.join(udr,"preferedExploit.txt"))
            if (supportedExploits.includes(fc.toString())) {
                return fc.toString()
            } else {
                return "null"
            }
        } else {
            return "null"
        }
    } catch(e) {
        return "null"
    }
}

async function getPreferedTheme(override) {
    var preferedTheme = override || "jellyfish-lsef/jellyfish-ui"
    try {
        if (!override && fs.existsSync(path.join(udr,"preferedUi.txt"))) {
            preferedTheme = fs.readFileSync(path.join(udr,"preferedUi.txt")).toString()
            console.log("Prefered theme file is",preferedTheme)
        }
        if (preferedTheme.startsWith("local/")) {
            if (fs.existsSync(path.join(preferedTheme.replace("local/",""),"package.json"))) {
                console.log("Using local theme",preferedTheme)
                return preferedTheme;
            } else {
                dialog.showMessageBoxSync(win,{
                    message: preferedTheme + " isn't a valid theme",
                    detail: "There is no file called package.json in the theme.",
                })
                return "jellyfish-lsef/jellyfish-ui"
            }
        } else {
            console.log("Checking",preferedTheme)
            var f = await fetch("https://raw.githubusercontent.com/" + preferedTheme + "/master/package.json")
            if (f.ok) {
                console.log("package.json exists on",preferedTheme)
                var j = await f.json()
                if (j.keywords && j.keywords.includes && j.keywords.includes("jellyfish-ui")) {
                    console.log(preferedTheme,"has a valid package.json")
                    return preferedTheme;
                } else {
                    console.log(preferedTheme,"doesn't have a valid package.json")
                    dialog.showMessageBoxSync(win,{
                        message: preferedTheme + " isn't a valid theme",
                        detail: "The package.json didn't include an array called keywords, or it didn't include 'jellyfish-ui'",
                    })
                    return "jellyfish-lsef/jellyfish-ui"
                }
            } else {
                dialog.showMessageBoxSync(win,{
                    message: preferedTheme + " isn't a valid theme",
                    detail: "The request to get the package.json file failed with error code " + f.status + ". Make sure that the repo exists, and that there is a package.json in the root of master.",
                })
                return "jellyfish-lsef/jellyfish-ui"
            }
        }

    } catch(e) {
        console.error(e)
        dialog.showMessageBoxSync(win,{
            message: "Couldn't validate theme " + preferedTheme,
            detail: e.toString(),
        })
        return "jellyfish-lsef/jellyfish-ui"
    }
}

function restart() {
    var argv = process.argv
    /*child_process.spawn(argv.shift(),argv,{
        ...process,
        cwd: process.cwd(),
        detached: true,
    }).unref();*/
    app.quit()
    
}

async function createWindow () {
    global.exploitName = (getPreferedExploit())
    global.exploit = require("./exploits/" + exploitName)
    if (false && dialog.showMessageBoxSync({
        buttons: ["No","Yes"],
        defaultId: 1,
        message: "PLEASE READ",
        detail: "Jellyfish is only to be used on games that you have explicit permission to run a LSI on.\n\nAre you intending to use Jellyfish to inject into games you are not the owner of, or do not have permission from the owner to run a LSI on?",
    }) == 1) {
        return process.exit()
    }
    
    // Create the browser window.
    var win = new BrowserWindow({
        width: 368,
        height: 1,
        show:true,
        webPreferences: {
            nodeIntegration: false,
        },
        alwaysOnTop: true,
        fullscreenable: false,
        resizable: false
    })
    win.setVisibleOnAllWorkspaces(true);
    global.win = win
    win.loadFile('preloader.html')
    win.removeMenu()
    ipcMain.on("gimmie-devtools",() => { win.webContents.openDevTools() })

    global.win = win
    win.setTitle("Jellyfish | Creating required files")
    if (!fs.existsSync(JELLYFISH_DATA_DIR)) {
        fs.mkdirSync(JELLYFISH_DATA_DIR)
    }
    if (!fs.existsSync(path.join(JELLYFISH_DATA_DIR,"Config"))) {
        fs.mkdirSync(path.join(JELLYFISH_DATA_DIR,"Config"))
    }
    
    if (!fs.existsSync(path.join(JELLYFISH_DATA_DIR,"Scripts"))) {
        fs.mkdirSync(path.join(JELLYFISH_DATA_DIR,"Scripts"))
        //console.log(child_process.execSync(`cd;curl  > default.zip;unzip default.zip; rm default.zip`).toString())
        win.setTitle("Jellyfish | Downloading scripts")
        var f = await fetch('http://jellyfish.thelmgn.com/Jellyfish_Default_Scripts.zip')
        var b = await f.buffer()
        require("extract-zip")(b, { dir: path.join(JELLYFISH_DATA_DIR,"Scripts") })
        exploit.downloadInitialScripts()
    }
    win.setTitle("Jellyfish | Checking for updates")
    getLatest = ((j,platform) => {
        for (var r of j) {
            for (var asset of r.assets) {
                if (asset.name.includes(platform)) return {asset,r};
            }
        }
        return false;
    })
    try {
        var j = await (await fetch("https://api.github.com/repositories/273986462/releases")).json()
        var cv = require("./package.json").version
        var nv = getLatest(j,process.platform)
        if (require("semver").lt(cv, nv.r.tag_name)) {    
            var update = dialog.showMessageBoxSync(win,{
                buttons: ["Quit","Yes"],
                defaultId: 1,
                message: "Update required",
                detail: `The latest version of Jellyfish is ${nv.r.tag_name}, you're running ${cv}, would you like to update now?\n\nChangelog:\n${nv.r.body}`,
            })
            if (update) {
                openUrl("https://jellyfish.thelmgn.com")
            }
            process.exit()
        }
    } catch(e) {
        console.error(e)
    }
    win.setTitle("Jellyfish | Updating theme")
    var preferedTheme = await getPreferedTheme()
    console.log("Updating theme",preferedTheme)
    win.setTitle("Jellyfish | Updating " + preferedTheme)
    var tp = path.join(udr,"themeCache")
    var ac
    var zip = new Promise((a,r) => {ac = a})
    if (preferedTheme.startsWith("local/")) {
        tp = path.join(preferedTheme.replace("local/",""))
    } else {
        var n2u = true
        // Only update if there's an update available
        if (fs.existsSync(path.join(tp, "version.txt")) ) {
            var ver = fs.readFileSync(path.join(tp, "version.txt")).toString()
            if (ver.startsWith(preferedTheme.toLowerCase() + "/")) {
                var f = await fetch(`https://api.github.com/repos/${preferedTheme}/commits?per_page=1`)
                var j = await f.json()
                if (j[0] && ver == preferedTheme.toLowerCase() + "/" + j[0].sha) {
                    tp = path.join(tp, preferedTheme.split("/")[1] + "-master")
                    n2u = false
                }
            }
        }
        if (n2u) {
            if (fs.existsSync(tp)) fs.rmdirSync(tp, {recursive:true});
            fs.mkdirSync(tp)
            var f = await fetch(`https://codeload.github.com/${preferedTheme}/zip/master`)
            var b = await f.buffer()
            var writtenVersion = false
            var a = ac
            ac = () => {}

            var to = 0
            require("extract-zip")(b, { dir: tp,onEntry: (e,z) => {
                console.log("Unzipping",e.fileName)
                to = clearTimeout(to)
                setTimeout(a,1000)
                if (!writtenVersion) {
                    fs.writeFileSync(path.join(udr,"themeCache", "version.txt"),preferedTheme.toLowerCase() + "/" + z.comment)
                    writtenVersion = true
                }
            }})
            tp = path.join(tp, preferedTheme.split("/")[1] + "-master")
        }
    }
    ac()
    zip.then(async () => {
        var themePkg = require(path.join(tp,"package.json"))
        var h = path.join(tp,themePkg.main)
        win.setTitle("Jellyfish | Loading UI")
        var nwin = new BrowserWindow({
            width: themePkg.width || 768,
            height: themePkg.height || 585,
            resizable: !themePkg.fixedSize,
            show:true,
            frame: !themePkg.borderless,
            webPreferences: {
                nodeIntegration: false,
                enableRemoteModule: false,
                preload: path.join(__dirname, 'preload.js')
            },
        })
        nwin.removeMenu()
        nwin.loadFile(path.resolve(h))
        win.destroy()
        win = nwin
        global.win = nwin
        ipcMain.on("gimmie-devtools",() => { win.webContents.openDevTools() })
        ipcMain.on('inject-button-click',exploit.inject)
        ipcMain.on('check-creds',exploit.checkCreds)
        
        var tmin = 0
        ipcMain.on('set-topmost', (event,arg) => {
            win.setAlwaysOnTop(arg, "floating");
            win.setVisibleOnAllWorkspaces(arg);
            win.setFullScreenable(!arg);
        })
        ipcMain.on('run-script', async (event, arg) => {
            setTimeout(function() { exploit.runScript(arg) })
        })
        ipcMain.on("save-script", (evt,script) => {    
            console.log("save-script")
            var loc = dialog.showSaveDialogSync(win, {
                title: "Save Current Script",
                defaultPath: path.join(homedir,"Documents","Jellyfish","Scripts"),
                buttonLabel: "Save",
                message:"Choose where you want to save the current script in the editor.",
                filters: [{extensions: ["lua","txt"]}]
            })
            if (!loc) return;
            if (!loc.endsWith(".lua") && !loc.endsWith(".txt")) {
                loc += ".lua"
            }
            fs.writeFileSync(loc,script)
        })
        exploit.init()
        var key = ""
        
        function traverse(ckey,evt) {
            var scriptsDir = path.join(JELLYFISH_DATA_DIR,"Scripts")
            var walker = require("walker")(scriptsDir)
            walker.filterDir(() => {return key == ckey})
            walker.on("file", function(file,stat) {
                evt.reply('script-found',[key,scriptsDir,file])
            })
            walker.on("end", function() {
                evt.reply("script-finish",[key,scriptsDir])
            })
        }
        ipcMain.on("startCrawl",(evt,ckey) => {
            key = ckey
            traverse(key,evt)
        })
        ipcMain.on("switch-exploit", (evt,exploit) => {
            if (supportedExploits.includes(exploit)) {
                fs.writeFileSync(path.join(udr,"preferedExploit.txt"),exploit)
                dialog.showMessageBoxSync(win,{
                    buttons: ["Restart"],
                    defaultId: 1,
                    message: "Restart required.",
                    detail: `Jellyfish requires a restart to switch exploit.`,
                })
                restart()
            } else {
                console.error(exploit,"isn't a valid exploit.")
            }
        })
        ipcMain.on("switch-theme",async (evt,theme)=> {
            var valid = theme == "jellyfish-lsef/jellyfish-ui" || (await getPreferedTheme(theme) != "jellyfish-lsef/jellyfish-ui" && dialog.showMessageBoxSync(win,{
                buttons: ["Cancel","Change Theme"],
                defaultId: 1,
                message: "Change theme to " + theme + "?",
                detail: `If you confirm this change, Jellyfish will restart to download and apply the changes.`,
            }))
            if (!valid) return;
            fs.writeFileSync(path.join(udr,"preferedUi.txt"),theme)
            restart()
        })

        function openUrl(url) {
            if (process.platform == "darwin") {
                child_process.spawnSync("open",[url])
            } else {
                child_process.spawnSync("cmd",["/s","/c","start",url,"/b"])
            }
        }
        

        ipcMain.on("ready", () => {
            
            setTimeout(async function() {
                win.show()
                win.webContents.setZoomFactor(1);
                win.webContents.setVisualZoomLevelLimits(1, 1);
                httpListener = function(req,res) {
                    var queryObject = url.parse(req.url,true).query;
                    console.log(queryObject)
                    win.webContents.send("http-request",queryObject)
                }
                
                win.webContents.send("supported-exploits",supportedExploits)
                win.webContents.send("set-exploit",global.exploitName)
                //win.webContents.setLayoutZoomLevelLimits(0, 0);
            },300)
        })

        
        win.webContents.on('new-window', function(event, url){
            event.preventDefault();
            openUrl(url)
        });
        
    
    })
     
    
    
}

app.whenReady().then(createWindow)
app.on('window-all-closed', () => {
    app.quit()
})
