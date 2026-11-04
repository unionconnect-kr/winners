import {readFileSync,writeFileSync,copyFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const mobile=resolve(dirname(fileURLToPath(import.meta.url)),'..');
// Xcode only runs on macOS. sips produces the mandatory opaque 1024px icon
// from the existing MANEE artwork; no default Capacitor artwork ships in CI.
if(process.platform!=='darwin'){console.log('Brand asset generation runs on macOS before Xcode.');process.exit(0);}
const assets=resolve(mobile,'ios/App/App/Assets.xcassets');
const source=resolve(mobile,'../icons/icon-512.png');
execFileSync('/usr/bin/sips',['-z','1024','1024',source,'--out',resolve(assets,'AppIcon.appiconset/AppIcon-512@2x.png')],{stdio:'ignore'});
const splash=resolve(assets,'Splash.imageset');
const catalog=JSON.parse(readFileSync(resolve(splash,'Contents.json'),'utf8'));
for(const image of catalog.images)copyFileSync(source,resolve(splash,image.filename));
console.log('MANEE icon and launch artwork prepared.');
