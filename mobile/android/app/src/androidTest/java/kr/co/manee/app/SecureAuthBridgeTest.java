package kr.co.manee.app;

import static org.junit.Assert.*;
import android.content.Intent;
import android.net.Uri;
import androidx.test.core.app.ActivityScenario;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

// Synthetic namespace only; never signs into a user account or changes a store.
@RunWith(AndroidJUnit4.class)
public class SecureAuthBridgeTest {
 private String evaluate(ActivityScenario<MainActivity> scenario,String js)throws Exception{
  CountDownLatch ready=new CountDownLatch(1);AtomicReference<String> result=new AtomicReference<>();
  scenario.onActivity(activity->activity.getBridge().getWebView().evaluateJavascript(js,value->{result.set(value);ready.countDown();}));
  assertTrue("WebView evaluation timed out",ready.await(10,TimeUnit.SECONDS));return result.get();
 }
 @Test public void packagedPageConnectsToRealVaultAndSocialPlugins()throws Exception{
  try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)){
   boolean initialized=false;
   for(int i=0;i<100;i++){
    if("true".equals(evaluate(scenario,"Boolean(window.MANEE_SECURE_STORAGE && document.body.innerText.includes('매니 1.42'))"))){initialized=true;break;}
    Thread.sleep(100);
   }
   assertTrue("1.42 page did not load",initialized);
   assertEquals("true",evaluate(scenario,"['ManeeSecureAuth','ManeeReportFiles','ManeePlayBilling','App','Browser','Geolocation'].every(n=>Capacitor.isPluginAvailable(n))"));
   evaluate(scenario,"window.__vaultSmoke='pending';(async()=>{try{await MANEE_SECURE_STORAGE.ready;const p=Capacitor.Plugins.ManeeSecureAuth,k='localStorage:manee-abcdefghijklmnopqrst-auth';try{await p.set({key:k,value:'synthetic-device-check'});if((await p.get({key:k})).value!=='synthetic-device-check')throw Error('roundtrip');if(localStorage.getItem(k)!==null)throw Error('plaintext');}finally{await p.remove({key:k});}if((await p.get({key:k})).value!==null)throw Error('deletion');window.__vaultSmoke='passed';}catch(e){window.__vaultSmoke='failed';}})();");
   String result="";
   for(int i=0;i<100;i++){result=evaluate(scenario,"window.__vaultSmoke");if(!"\"pending\"".equals(result))break;Thread.sleep(100);}
   assertEquals("\"passed\"",result);
  }
 }
 @Test public void socialCallbackResolvesToThisApp(){
  var context=InstrumentationRegistry.getInstrumentation().getTargetContext();
  Intent intent=new Intent(Intent.ACTION_VIEW,Uri.parse(context.getPackageName()+"://auth/callback"));
  intent.addCategory(Intent.CATEGORY_BROWSABLE);intent.setPackage(context.getPackageName());
  var resolved=context.getPackageManager().resolveActivity(intent,0);
  assertNotNull("Social login callback is missing",resolved);
  assertEquals(MainActivity.class.getName(),resolved.activityInfo.name);
 }
}
