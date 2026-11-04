package kr.co.manee.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.HashMap;
import java.util.Map;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

// The manifest disables Android backup. Only AES-GCM ciphertext is persisted;
// encryption keys remain non-exportable in AndroidKeyStore.
public final class ManeeSecureAuthStore {
    private static final Map<String,String> volatileValues = new HashMap<>();
    private final SharedPreferences prefs;
    private final String alias;
    public ManeeSecureAuthStore(Context context, String namespace) {
        alias=context.getPackageName()+"."+namespace;
        prefs=context.getSharedPreferences(namespace,Context.MODE_PRIVATE);
    }
    private SecretKey encryptionKey() throws Exception {
        KeyStore ks=KeyStore.getInstance("AndroidKeyStore");ks.load(null);
        if(ks.containsAlias(alias))return (SecretKey)ks.getKey(alias,null);
        KeyGenerator generator=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(alias,KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256).setRandomizedEncryptionRequired(true).build());
        return generator.generateKey();
    }
    private void validate(String key) {
        if(key==null||!key.matches("(localStorage|sessionStorage):(sb-[a-z]{20}-auth-token(-code-verifier|-user)?|manee-[a-z]{20}-(auth(-code-verifier|-user)?|social-(code-verifier|pending)))"))throw new IllegalArgumentException("Invalid auth slot");
    }
    public synchronized String get(String key) throws Exception {
        validate(key);
        if(key.startsWith("sessionStorage:"))synchronized(volatileValues){return volatileValues.get(alias+":"+key);}
        String encoded=prefs.getString(key,null);if(encoded==null)return null;
        String[] parts=encoded.split(":",-1);if(parts.length!=3||!parts[0].equals("v1"))throw new IllegalStateException("Invalid secure record");
        byte[] iv=Base64.decode(parts[1],Base64.NO_WRAP);if(iv.length!=12)throw new IllegalStateException("Invalid IV");
        Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE,encryptionKey(),new GCMParameterSpec(128,iv));
        cipher.updateAAD(key.getBytes(StandardCharsets.UTF_8));
        return new String(cipher.doFinal(Base64.decode(parts[2],Base64.NO_WRAP)),StandardCharsets.UTF_8);
    }
    public synchronized void set(String key,String value) throws Exception {
        validate(key);if(value==null||value.getBytes(StandardCharsets.UTF_8).length>65536)throw new IllegalArgumentException("Invalid auth value");
        if(key.startsWith("sessionStorage:")){synchronized(volatileValues){volatileValues.put(alias+":"+key,value);}return;}
        Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.ENCRYPT_MODE,encryptionKey());
        cipher.updateAAD(key.getBytes(StandardCharsets.UTF_8));
        String encoded="v1:"+Base64.encodeToString(cipher.getIV(),Base64.NO_WRAP)+":"+Base64.encodeToString(cipher.doFinal(value.getBytes(StandardCharsets.UTF_8)),Base64.NO_WRAP);
        if(!prefs.edit().putString(key,encoded).commit())throw new IllegalStateException("Secure write failed");
    }
    public synchronized void remove(String key) throws Exception {
        validate(key);
        if(key.startsWith("sessionStorage:")){synchronized(volatileValues){volatileValues.remove(alias+":"+key);}return;}
        if(!prefs.edit().remove(key).commit())throw new IllegalStateException("Secure removal failed");
    }
}
