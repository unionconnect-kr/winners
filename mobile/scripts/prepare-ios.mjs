import {readFileSync,writeFileSync,copyFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {iosUrlSchemePlist} from '../src/native-environment.mjs';
const mobile=resolve(dirname(fileURLToPath(import.meta.url)),'..');
// Xcode only runs on macOS. sips produces the mandatory opaque 1024px icon
// from the existing MANEE artwork; no default Capacitor artwork ships in CI.
if(process.platform!=='darwin'){console.log('Brand asset generation runs on macOS before Xcode.');process.exit(0);}
const assets=resolve(mobile,'ios/App/App/Assets.xcassets');
const source=resolve(mobile,'../icons/icon-512.png');
execFileSync('/usr/bin/sips',['-z','1024','1024',source,'--out',resolve(assets,'AppIcon.appiconset/AppIcon-512@2x.png')],{stdio:'ignore'});
const splash=resolve(assets,'Splash.imageset');
const catalog=JSON.parse(readFileSync(resolve(splash,'Contents.json'),'utf8'));
const buildInfo=JSON.parse(readFileSync(resolve(mobile,'www/build-info.json'),'utf8'));
const infoPlist=resolve(mobile,'ios/App/App/Info.plist');
writeFileSync(infoPlist,iosUrlSchemePlist(readFileSync(infoPlist,'utf8'),buildInfo.environment));
if(buildInfo.appleLoginMethod==='native'){
 const path=resolve(mobile,'ios/App/App/App.entitlements');
 const entitlements=readFileSync(path,'utf8');
 const key='com.apple.developer.applesignin';
 if(!entitlements.includes(key)){
  if(entitlements.split('</dict>').length!==2)throw Error('Unexpected iOS entitlements format');
  writeFileSync(path,entitlements.replace('</dict>', '<key>'+key+'</key><array><string>Default</string></array></dict>'));
 }
}
const launch=buildInfo.deviceFeedback?resolve(mobile,'assets/launch-144.png'):source;
for(const image of catalog.images)copyFileSync(launch,resolve(splash,image.filename));
if(buildInfo.deviceFeedback){
 const storyboard=resolve(mobile,'ios/App/App/Base.lproj/LaunchScreen.storyboard');
 let xml=readFileSync(storyboard,'utf8');
 xml=xml.replace(/\s*<constraints>\s*<constraint firstAttribute="width" constant="200" id="logo-width"\/>\s*<constraint firstAttribute="height" constant="200" id="logo-height"\/>\s*<\/constraints>/,'');
 if(!xml.includes('id="launch-width"'))xml=xml.replace('<constraint firstItem="manee-logo" firstAttribute="centerX"', '<constraint firstItem="manee-logo" firstAttribute="width" secondItem="snD-IY-ifK" secondAttribute="width" id="launch-width"/>\n                            <constraint firstItem="manee-logo" firstAttribute="height" secondItem="snD-IY-ifK" secondAttribute="height" id="launch-height"/>\n                            <constraint firstItem="manee-logo" firstAttribute="centerX"');
 writeFileSync(storyboard,xml);
}
console.log('MANEE icon and launch artwork prepared.');
