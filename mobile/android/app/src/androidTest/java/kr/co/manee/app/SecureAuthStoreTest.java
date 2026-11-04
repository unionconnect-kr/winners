package kr.co.manee.app;
import static org.junit.Assert.*;
import android.content.Context;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.junit.Test;
import org.junit.Before;
import org.junit.After;
import org.junit.runner.RunWith;
import java.security.KeyStore;

@RunWith(AndroidJUnit4.class)
public class SecureAuthStoreTest {
 private Context context;private ManeeSecureAuthStore store;
 private final String ns="manee_secure_auth_instrumented_test";
 private final String key="localStorage:manee-abcdefghijklmnopqrst-auth";
 @Before public void setup()throws Exception{context=InstrumentationRegistry.getInstrumentation().getTargetContext();cleanup();store=new ManeeSecureAuthStore(context,ns);}
 @After public void cleanup()throws Exception{if(context==null)return;context.getSharedPreferences(ns,0).edit().clear().commit();KeyStore ks=KeyStore.getInstance("AndroidKeyStore");ks.load(null);ks.deleteEntry(context.getPackageName()+"."+ns);}
 @Test public void encryptRoundtripReloadAndDelete()throws Exception{
  store.set(key,"synthetic-refresh-token");String raw=context.getSharedPreferences(ns,0).getString(key,null);
  assertFalse(raw.contains("synthetic-refresh-token"));assertTrue(raw.startsWith("v1:"));
  assertEquals("synthetic-refresh-token",new ManeeSecureAuthStore(context,ns).get(key));
  store.set(key,"synthetic-refresh-token");assertNotEquals(raw,context.getSharedPreferences(ns,0).getString(key,null));
  store.remove(key);assertNull(store.get(key));
 }
 @Test public void swappedCiphertextAndCorruptionAreRejected()throws Exception{
  store.set(key,"synthetic");String raw=context.getSharedPreferences(ns,0).getString(key,null);
  String other=key+"-user";context.getSharedPreferences(ns,0).edit().putString(other,raw).commit();
  try{store.get(other);fail("AAD must prevent swapping slots");}catch(Exception expected){}
  context.getSharedPreferences(ns,0).edit().putString(key,"v1:invalid:invalid").commit();
  try{store.get(key);fail("Corrupt records cannot become sessions");}catch(Exception expected){}
 }
 @Test public void nonRememberedTokensNeverReachPreferences()throws Exception{
  String session=key.replace("localStorage:","sessionStorage:");store.set(session,"synthetic-session-only");
  assertFalse(context.getSharedPreferences(ns,0).contains(session));assertEquals("synthetic-session-only",new ManeeSecureAuthStore(context,ns).get(session));
  store.remove(session);assertNull(store.get(session));
 }
 @Test public void unrelatedKeysAndOversizedValuesAreRejected()throws Exception{
  try{store.set("arbitrary","value");fail();}catch(IllegalArgumentException expected){}
  try{store.set(key,new String(new char[65537]));fail();}catch(IllegalArgumentException expected){}
 }
}
